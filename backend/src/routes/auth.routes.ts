import bcrypt from "bcryptjs";
import { Router, type Request, type Response } from "express";
import { signToken } from "../auth/tokens.js";
import { db } from "../db.js";
import { sendError } from "../middleware/errorHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { authSchema } from "../validation/auth.schema.js";

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

    // `users` is shared with Qbit. An account with Qbit's 2FA enabled must
    // not be able to sign in here without it — Evolution doesn't implement
    // 2FA verification yet (deferred to v1.1), so silently letting such an
    // account in would be a real security regression, not just a missing feature.
    if (user.two_factor_enabled) {
      return res.status(403).json({
        error: "This account has two-factor authentication enabled, which Evolution doesn't support yet. Please sign in with Qbit for now."
      });
    }

    if (user.deletion_status && user.deletion_status !== "active") {
      return res.status(403).json({ error: "This account is scheduled for deletion and can't sign in." });
    }

    const token = signToken(user.id, user.token_version);
    return res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    return sendError(res, 500, "Failed to login", error);
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
