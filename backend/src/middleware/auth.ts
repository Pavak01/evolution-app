import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../auth/tokens.js";
import { db } from "../db.js";

export type AuthenticatedRequest = Request & { userId: string };

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  let sub: string;
  let tokenVersion: number;
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded !== "object" || decoded === null || !("sub" in decoded)) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const decodedSub = (decoded as jwt.JwtPayload).sub;
    if (typeof decodedSub !== "string") {
      res.status(401).json({ error: "Invalid token subject" });
      return;
    }

    sub = decodedSub;
    const decodedVer = (decoded as jwt.JwtPayload & { ver?: unknown }).ver;
    tokenVersion = typeof decodedVer === "number" ? decodedVer : 0;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const result = await db.query<{ token_version: number }>(
      "SELECT token_version FROM users WHERE id = $1 LIMIT 1",
      [sub]
    );

    if (result.rows.length === 0 || result.rows[0].token_version !== tokenVersion) {
      res.status(401).json({ error: "Session has been revoked, please sign in again" });
      return;
    }

    (req as AuthenticatedRequest).userId = sub;
    next();
  } catch (error) {
    console.error("Failed to validate session", error);
    res.status(500).json({ error: "Failed to validate session" });
  }
}
