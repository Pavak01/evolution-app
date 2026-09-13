import { Router } from "express";

export const healthRouter = Router();

// No DB/S3 dependency — must respond even if those env vars are momentarily
// absent at boot (see db.ts / receiptStorage.ts lazy-init pattern).
healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});
