import bcrypt from "bcryptjs";
import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret, readPurposeToken, signEmailVerificationToken, signToken, signTwoFactorChallengeToken } from "../auth/tokens.js";
import { decryptTwoFactorSecret, verifyTotpCode } from "../auth/twoFactor.js";
import { db } from "../db.js";
import { checkCode, isDisposableEmail, isEmailVerified, markEmailVerified, sendCode } from "../emailCodes.js";
import { getAccess, type Access } from "../entitlements.js";
import { isAdmin } from "./admin.routes.js";
import { consumeBackupCode, looksLikeBackupCode } from "./twoFactor.routes.js";
import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms, recordTermsAcceptance } from "../terms.js";
import { sendError } from "../middleware/errorHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { authRateLimit, emailCodeRateLimit, registerRateLimit } from "../middleware/rateLimit.js";
import {
  acceptTermsSchema,
  accountDeletionRequestSchema,
  authSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  publicAccountDeletionRequestSchema,
  registerSchema,
  resendVerificationSchema,
  twoFactorVerifySchema,
  verifyEmailSchema
} from "../validation/auth.schema.js";

export const authRouter = Router();

// Included in every response that carries a `user` object (register, login,
// verify-2fa, /auth/me) — not just /auth/me — so the mobile app has current
// entitlement state immediately after signing in, not only after an app
// restart that re-hits /auth/me.
//
// getAccess also starts the free trial on first Evolution use. Build 110
// only reads ocr_upgrade_active, so it stays alongside the newer `access`.
async function buildUserPayload(
  id: string,
  email: string
): Promise<{
  id: string;
  email: string;
  is_admin: boolean;
  two_factor_enabled: boolean;
  terms: { current_version: string; accepted: boolean };
  entitlements: { ocr_upgrade_active: boolean; access: Access };
}> {
  const access = await getAccess(id);
  return {
    id,
    email,
    is_admin: await isAdmin(id),
    two_factor_enabled: (await db.query<{ on: boolean }>("SELECT two_factor_enabled AS on FROM users WHERE id = $1", [id])).rows[0]?.on ?? false,
    terms: { current_version: CURRENT_TERMS_VERSION, accepted: await hasAcceptedCurrentTerms(id) },
    entitlements: { ocr_upgrade_active: access.ocr, access }
  };
}

// The "now check your email" response. No session token — an unconfirmed
// account can't use the app (and its free trial doesn't start) until the
// emailed code is entered. A failed send still returns this, flagged, so
// the app can offer "Resend code" rather than leaving the account stuck.
async function emailVerificationResponse(userId: string, email: string) {
  let code_sent = true;
  let message: string | undefined;
  try {
    const result = await sendCode(userId, email, "verify");
    if (!result.sent) {
      // Cooldown: a code went out moments ago and is still valid.
      message = result.reason;
    }
  } catch (error) {
    console.error("Failed to send verification email", error);
    code_sent = false;
    message = "We couldn't send the code just now. Tap Resend code to try again.";
  }
  return { email_verification_required: true, verification_token: signEmailVerificationToken(userId), email, code_sent, message };
}

// After the email is confirmed: 2FA if it's on, otherwise a session.
async function completeSignIn(userId: string) {
  const result = await db.query<{ email: string; token_version: number; two_factor_enabled: boolean }>(
    "SELECT email, token_version, two_factor_enabled FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const user = result.rows[0];
  if (user.two_factor_enabled) {
    return { two_factor_required: true, challenge_token: signTwoFactorChallengeToken(userId), user: { id: userId, email: user.email } };
  }
  return { token: signToken(userId, user.token_version), user: await buildUserPayload(userId, user.email) };
}

authRouter.post("/auth/register", registerRateLimit, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const email = parsed.data.email;
  if (isDisposableEmail(email)) {
    return res.status(400).json({ error: "Please use a permanent email address — temporary inboxes can't be used." });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const existing = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const inserted = await db.query<{ id: string; email: string; token_version: number }>(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, $2, NOW())
       RETURNING id, email, token_version`,
      [email, passwordHash]
    );

    const user = inserted.rows[0];
    if (parsed.data.accepted_terms_version) {
      await recordTermsAcceptance(user.id, parsed.data.accepted_terms_version);
    }
    return res.status(201).json(await emailVerificationResponse(user.id, user.email));
  } catch (error) {
    return sendError(res, 500, "Failed to register", error);
  }
});

authRouter.post("/auth/login", authRateLimit, async (req: Request, res: Response) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const email = parsed.data.email;

  try {
    const result = await db.query<{
      id: string;
      email: string;
      password_hash: string;
      token_version: number;
      two_factor_enabled: boolean;
      deletion_status: string | null;
    }>(
      "SELECT id, email, password_hash, token_version, two_factor_enabled, deletion_status FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.deletion_status && user.deletion_status !== "active") {
      return res.status(403).json({ error: "This account is scheduled for deletion and can't sign in." });
    }

    // Email confirmed before anything else (2FA, session) — this is also
    // how an account registered before confirmation existed gets confirmed.
    if (!(await isEmailVerified(user.id))) {
      return res.json(await emailVerificationResponse(user.id, user.email));
    }

    // `users` is shared with Qbit, and this verifies against the exact same
    // encrypted TOTP secret Qbit already manages — not a parallel 2FA
    // system. Backup-code login is deliberately not supported here: Qbit
    // hashes backup codes using its own JWT_SECRET (not just the shared
    // TWO_FACTOR_ENCRYPTION_KEY), so verifying them here would mean holding
    // Qbit's session-signing secret too — out of scope for a login-time fix.
    if (user.two_factor_enabled) {
      return res.json({
        two_factor_required: true,
        challenge_token: signTwoFactorChallengeToken(user.id),
        user: { id: user.id, email: user.email }
      });
    }

    const token = signToken(user.id, user.token_version);
    return res.json({ token, user: await buildUserPayload(user.id, user.email) });
  } catch (error) {
    return sendError(res, 500, "Failed to login", error);
  }
});

authRouter.post("/auth/verify-2fa", authRateLimit, async (req: Request, res: Response) => {
  const parsed = twoFactorVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  let userId: string;
  try {
    const decoded = jwt.verify(parsed.data.challenge_token, getJwtSecret());
    if (typeof decoded !== "object" || decoded === null) {
      return res.status(401).json({ error: "Invalid verification challenge" });
    }
    const payload = decoded as jwt.JwtPayload;
    if (payload.purpose !== "two-factor-login" || typeof payload.sub !== "string") {
      return res.status(401).json({ error: "Invalid verification challenge" });
    }
    userId = payload.sub;
  } catch {
    return res.status(401).json({ error: "Verification challenge expired" });
  }

  try {
    const result = await db.query<{ id: string; email: string; two_factor_secret: string | null; token_version: number }>(
      "SELECT id, email, two_factor_secret, token_version FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    const secret = decryptTwoFactorSecret(user.two_factor_secret);
    const totpOk = Boolean(secret && verifyTotpCode(secret, parsed.data.code));
    // A one-time backup code (lost phone) works in place of the 6-digit code.
    const backupOk = !totpOk && looksLikeBackupCode(parsed.data.code) && (await consumeBackupCode(user.id, parsed.data.code));
    if (!totpOk && !backupOk) {
      return res.status(401).json({ error: "That code isn't right." });
    }

    // Kept for HMRC's Gov-Client-Multi-Factor fraud-prevention header
    // (Making Tax Digital): which second factor opened this session, when.
    await db
      .query("INSERT INTO mfa_events (user_id, method) VALUES ($1, $2)", [user.id, totpOk ? "TOTP" : "OTHER"])
      .catch((error) => console.error("Failed to record 2FA sign-in", error));

    const token = signToken(user.id, user.token_version);
    return res.json({ token, user: await buildUserPayload(user.id, user.email) });
  } catch (error) {
    return sendError(res, 500, "Failed to verify two-factor code", error);
  }
});

authRouter.post("/auth/verify-email", emailCodeRateLimit, async (req: Request, res: Response) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter the 6-digit code from the email." });
  }
  const userId = readPurposeToken(parsed.data.verification_token, "email-verification");
  if (!userId) {
    return res.status(401).json({ error: "This sign-up step has expired. Sign in again to get a new code." });
  }
  try {
    const result = await checkCode(userId, "verify", parsed.data.code);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    await markEmailVerified(userId);
    return res.json(await completeSignIn(userId));
  } catch (error) {
    return sendError(res, 500, "Failed to confirm email", error);
  }
});

authRouter.post("/auth/resend-verification", emailCodeRateLimit, async (req: Request, res: Response) => {
  const parsed = resendVerificationSchema.safeParse(req.body);
  const userId = parsed.success ? readPurposeToken(parsed.data.verification_token, "email-verification") : null;
  if (!userId) {
    return res.status(401).json({ error: "This sign-up step has expired. Sign in again to get a new code." });
  }
  try {
    const user = await db.query<{ email: string }>("SELECT email FROM users WHERE id = $1 LIMIT 1", [userId]);
    const result = await sendCode(userId, user.rows[0].email, "verify");
    if (!result.sent) {
      return res.status(429).json({ error: result.reason, retry_after_seconds: result.retryAfterSeconds ?? null });
    }
    return res.json({ sent: true });
  } catch (error) {
    return sendError(res, 502, "We couldn't send the code just now. Please try again.", error);
  }
});

// Always the same answer, so this can't be used to find out whether an
// email has an account.
const RESET_REQUESTED_MESSAGE = "If that email has an Evolution account, we've sent it a code.";

authRouter.post("/auth/password-reset/request", emailCodeRateLimit, async (req: Request, res: Response) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  try {
    const found = await db.query<{ id: string; email: string; deletion_status: string | null }>(
      "SELECT id, email, deletion_status FROM users WHERE email = $1 LIMIT 1",
      [parsed.data.email]
    );
    const user = found.rows[0];
    if (user && (!user.deletion_status || user.deletion_status === "active")) {
      // Cooldown/limit results are deliberately not surfaced (same answer either way).
      await sendCode(user.id, user.email, "reset").catch((error) => console.error("Failed to send reset email", error));
    }
    return res.json({ message: RESET_REQUESTED_MESSAGE });
  } catch (error) {
    return sendError(res, 500, "Failed to request a password reset", error);
  }
});

authRouter.post("/auth/password-reset/confirm", emailCodeRateLimit, async (req: Request, res: Response) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter the code and a new password of at least 8 characters." });
  }
  try {
    const found = await db.query<{ id: string; deletion_status: string | null }>(
      "SELECT id, deletion_status FROM users WHERE email = $1 LIMIT 1",
      [parsed.data.email]
    );
    const user = found.rows[0];
    if (!user || (user.deletion_status && user.deletion_status !== "active")) {
      return res.status(400).json({ error: "That code has expired or been used up. Ask for a new one." });
    }
    const result = await checkCode(user.id, "reset", parsed.data.code);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    const passwordHash = await bcrypt.hash(parsed.data.new_password, 12);
    // token_version bump signs out every other device.
    await db.query("UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1", [user.id, passwordHash]);
    // Getting the code proves they own the inbox.
    await markEmailVerified(user.id);
    return res.json({ reset: true, message: "Password changed. You're being signed in." });
  } catch (error) {
    return sendError(res, 500, "Failed to reset password", error);
  }
});

// One-time "We've updated our terms" (or first acceptance for accounts made
// before acceptance was asked for). Only the current version can be accepted.
authRouter.post("/auth/accept-terms", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = acceptTermsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  try {
    if (!(await recordTermsAcceptance(authReq.userId, parsed.data.version))) {
      return res.status(409).json({ error: "The terms have been updated since you opened them. Please review the latest version.", current_version: CURRENT_TERMS_VERSION });
    }
    const row = await db.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [authReq.userId]);
    return res.json({ user: await buildUserPayload(authReq.userId, row.rows[0].email) });
  } catch (error) {
    return sendError(res, 500, "Failed to record acceptance", error);
  }
});

// Marks the account for deletion — matches Qbit's exact semantics on the
// shared `deletion_status`/`deletion_requested_at` columns (Qbit's own
// background job already purges Qbit's tables for any user in this state;
// Evolution's own job below purges evolution.* tables independently,
// neither needs to know about the other's schema). Refuses a second
// request if one is already pending or completed, matching Qbit.
async function markAccountForDeletion(userId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const result = await db.query<{ deletion_status: string | null }>("SELECT deletion_status FROM users WHERE id = $1", [userId]);
  if (result.rows.length === 0) {
    return { ok: false, status: 404, error: "User not found." };
  }
  if (result.rows[0].deletion_status && result.rows[0].deletion_status !== "active") {
    return { ok: false, status: 400, error: "Account deletion already requested." };
  }

  await db.query("UPDATE users SET deletion_requested_at = NOW(), deletion_status = 'pending' WHERE id = $1", [userId]);
  return { ok: true };
}

authRouter.post("/auth/account-deletion-request", requireAuth, authRateLimit, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = accountDeletionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const result = await markAccountForDeletion(authReq.userId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ success: true, message: "Account deletion request received. Your account and data will be deleted within 30 days." });
  } catch (error) {
    return sendError(res, 500, "Failed to process deletion request", error);
  }
});

// Unauthenticated on purpose — Google Play requires a way to request
// account deletion without having the app installed or a live session.
// Unlike Qbit's equivalent public page (email + self-asserted name only,
// no password), this requires the actual account password so a deletion
// request can't be filed against someone else's account by a third party
// who just knows their email address.
authRouter.post("/public/account-deletion-request", authRateLimit, async (req: Request, res: Response) => {
  const parsed = publicAccountDeletionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  try {
    const result = await db.query<{ id: string; password_hash: string }>(
      "SELECT id, password_hash FROM users WHERE email = $1 LIMIT 1",
      [parsed.data.email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(parsed.data.password, result.rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const deletion = await markAccountForDeletion(result.rows[0].id);
    if (!deletion.ok) {
      return res.status(deletion.status).json({ error: deletion.error });
    }
    return res.json({ success: true, message: "Account deletion request received. Your account and data will be deleted within 30 days." });
  } catch (error) {
    return sendError(res, 500, "Failed to process deletion request", error);
  }
});

authRouter.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const result = await db.query<{ id: string; email: string; created_at: string }>(
      "SELECT id, email, created_at::text FROM users WHERE id = $1 LIMIT 1",
      [authReq.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const row = result.rows[0];
    return res.json({ user: { ...(await buildUserPayload(row.id, row.email)), created_at: row.created_at } });
  } catch (error) {
    return sendError(res, 500, "Failed to load user", error);
  }
});
