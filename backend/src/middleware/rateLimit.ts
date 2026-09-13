import type { NextFunction, Request, Response } from "express";

type RateLimitEntry = { count: number; resetAt: number };

const rateLimitStore = new Map<string, RateLimitEntry>();

export function createRateLimitMiddleware({
  key,
  windowMs,
  max,
  message
}: {
  key: string;
  windowMs: number;
  max: number;
  message: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const entryKey = `${key}:${ip}`;
    const existing = rateLimitStore.get(entryKey);

    if (!existing || existing.resetAt <= now) {
      rateLimitStore.set(entryKey, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;
    rateLimitStore.set(entryKey, existing);

    if (existing.count > max) {
      const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retryAfterSeconds)));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

export const authRateLimit = createRateLimitMiddleware({
  key: "auth",
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: "Too many authentication attempts. Please try again later."
});

// Higher than Qbit's equivalent (25/10min): frequent small captures are the
// whole point of this app's workflow, not an occasional weekly action.
export const uploadRateLimit = createRateLimitMiddleware({
  key: "upload",
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: "Too many upload attempts. Please try again later."
});
