import bcrypt from "bcryptjs";
import { createHmac, randomInt } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getJwtSecret } from "../auth/tokens.js";
import {
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  generateTwoFactorSecret,
  otpauthUrl,
  verifyTotpCode
} from "../auth/twoFactor.js";
import { db } from "../db.js";
import { sendError } from "../middleware/errorHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { twoFactorManageRateLimit } from "../middleware/rateLimit.js";

// Turning 2FA on and off from inside Evolution (it used to only verify a
// secret Qbit had set up). Same users.two_factor_* columns and encryption.
export const twoFactorRouter = Router();

const BACKUP_CODE_COUNT = 10;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const normalizeBackupCode = (code: string) => code.replace(/[\s-]+/g, "").toUpperCase();
const hashBackupCode = (code: string) => createHmac("sha256", getJwtSecret()).update(`backup-code:${normalizeBackupCode(code)}`).digest("hex");
export const looksLikeBackupCode = (code: string) => /^[A-Z0-9]{8}$/.test(normalizeBackupCode(code));

function newBackupCode(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// Replaces every backup code for the account; the plain codes are only
// ever returned here, once.
async function issueBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, newBackupCode);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM two_factor_backup_codes WHERE user_id = $1", [userId]);
    for (const code of codes) {
      await client.query("INSERT INTO two_factor_backup_codes (user_id, code_hash) VALUES ($1, $2)", [userId, hashBackupCode(code)]);
    }
    await client.query("COMMIT");
    return codes;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Marks a matching unused backup code as used. Exported for sign-in.
export async function consumeBackupCode(userId: string, code: string): Promise<boolean> {
  const result = await db.query(
    "UPDATE two_factor_backup_codes SET used_at = NOW() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id",
    [userId, hashBackupCode(code)]
  );
  return (result.rowCount ?? 0) > 0;
}

// The authenticator code, or (where allowed) an unused backup code.
async function codeIsValid(userId: string, encryptedSecret: string | null, code: string, allowBackup: boolean): Promise<boolean> {
  const secret = decryptTwoFactorSecret(encryptedSecret);
  if (secret && verifyTotpCode(secret, code)) return true;
  return allowBackup && looksLikeBackupCode(code) && (await consumeBackupCode(userId, code));
}

type UserRow = { email: string; password_hash: string; two_factor_enabled: boolean; two_factor_secret: string | null; two_factor_pending_secret: string | null };
async function loadUser(userId: string): Promise<UserRow> {
  const result = await db.query<UserRow>(
    "SELECT email, password_hash, two_factor_enabled, two_factor_secret, two_factor_pending_secret FROM users WHERE id = $1",
    [userId]
  );
  return result.rows[0];
}

const codeSchema = z.object({ code: z.string().trim().min(6).max(12) });
const disableSchema = z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(12) });

// Step 1: a fresh secret, held as "pending" until a code proves the
// authenticator app has it. Nothing changes for sign-in yet.
twoFactorRouter.post("/auth/2fa/setup", requireAuth, twoFactorManageRateLimit, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    const user = await loadUser(userId);
    if (user.two_factor_enabled) {
      return res.status(409).json({ error: "Two-factor authentication is already on." });
    }
    const secret = generateTwoFactorSecret();
    await db.query("UPDATE users SET two_factor_pending_secret = $2 WHERE id = $1", [userId, encryptTwoFactorSecret(secret)]);
    return res.json({ secret, otpauth_url: otpauthUrl(user.email, secret) });
  } catch (error) {
    return sendError(res, 500, "Failed to start two-factor setup", error);
  }
});

// Step 2: the code from the authenticator app turns it on, and the
// backup codes are handed over (once).
twoFactorRouter.post("/auth/2fa/enable", requireAuth, twoFactorManageRateLimit, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the 6-digit code from your authenticator app." });
  try {
    const user = await loadUser(userId);
    if (user.two_factor_enabled) return res.status(409).json({ error: "Two-factor authentication is already on." });
    const pending = decryptTwoFactorSecret(user.two_factor_pending_secret);
    if (!pending) return res.status(400).json({ error: "Start the setup again — it has expired." });
    if (!verifyTotpCode(pending, parsed.data.code)) {
      return res.status(400).json({ error: "That code isn't right. Check the time on your phone is set automatically, and try the newest code." });
    }
    await db.query(
      `UPDATE users SET two_factor_enabled = TRUE, two_factor_secret = two_factor_pending_secret,
         two_factor_pending_secret = NULL, two_factor_enabled_at = NOW() WHERE id = $1`,
      [userId]
    );
    return res.json({ enabled: true, backup_codes: await issueBackupCodes(userId) });
  } catch (error) {
    return sendError(res, 500, "Failed to turn on two-factor authentication", error);
  }
});

twoFactorRouter.post("/auth/2fa/disable", requireAuth, twoFactorManageRateLimit, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const parsed = disableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your password and a code." });
  try {
    const user = await loadUser(userId);
    if (!user.two_factor_enabled) return res.status(409).json({ error: "Two-factor authentication is already off." });
    if (!(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      return res.status(401).json({ error: "That password isn't right." });
    }
    if (!(await codeIsValid(userId, user.two_factor_secret, parsed.data.code, true))) {
      return res.status(401).json({ error: "That code isn't right." });
    }
    await db.query(
      `UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL, two_factor_pending_secret = NULL,
         two_factor_enabled_at = NULL WHERE id = $1`,
      [userId]
    );
    await db.query("DELETE FROM two_factor_backup_codes WHERE user_id = $1", [userId]);
    return res.json({ enabled: false });
  } catch (error) {
    return sendError(res, 500, "Failed to turn off two-factor authentication", error);
  }
});

twoFactorRouter.post("/auth/2fa/backup-codes", requireAuth, twoFactorManageRateLimit, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the 6-digit code from your authenticator app." });
  try {
    const user = await loadUser(userId);
    if (!user.two_factor_enabled) return res.status(409).json({ error: "Two-factor authentication is off." });
    if (!(await codeIsValid(userId, user.two_factor_secret, parsed.data.code, false))) {
      return res.status(401).json({ error: "That code isn't right." });
    }
    return res.json({ backup_codes: await issueBackupCodes(userId) });
  } catch (error) {
    return sendError(res, 500, "Failed to make new backup codes", error);
  }
});
