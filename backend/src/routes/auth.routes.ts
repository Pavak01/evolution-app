import bcrypt from "bcryptjs";
import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret, signToken, signTwoFactorChallengeToken } from "../auth/tokens.js";
import { decryptTwoFactorSecret, verifyTotpCode } from "../auth/twoFactor.js";
import { db } from "../db.js";
import { sendError } from "../middleware/errorHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { authSchema, twoFactorVerifySchema } from "../validation/auth.schema.js";

export const authRouter = Router();

authRouter.post("/auth/register", authRateLimit, async (req: Request, res: Response) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const email = parsed.data.email;
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
    const token = signToken(user.id, user.token_version);
    return res.status(201).json({ token, user: { id: user.id, email: user.email } });
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
    return res.json({ token, user: { id: user.id, email: user.email } });
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
    if (!secret || !verifyTotpCode(secret, parsed.data.code)) {
      return res.status(401).json({ error: "Invalid verification code" });
    }

    const token = signToken(user.id, user.token_version);
    return res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    return sendError(res, 500, "Failed to verify two-factor code", error);
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

    return res.json({ user: result.rows[0] });
  } catch (error) {
    return sendError(res, 500, "Failed to load user", error);
  }
});
