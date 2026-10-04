import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { sendError } from "../middleware/errorHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { createPromoCode, disablePromoCode, listPromoCodes, PromoCodeError } from "../promoCodes.js";

export const adminRouter = Router();

export async function isAdmin(userId: string): Promise<boolean> {
  return (await db.query("SELECT 1 FROM admin_users WHERE user_id = $1", [userId])).rows.length > 0;
}

// Checked by the server on every admin request — hiding the screen in the
// app is a convenience, not the protection.
async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!(await isAdmin((req as AuthenticatedRequest).userId))) {
      res.status(403).json({ error: "This is only available to Evolution admins." });
      return;
    }
    next();
  } catch (error) {
    sendError(res, 500, "Failed to check admin access", error);
  }
}

const createSchema = z.object({
  tier: z.enum(["basic", "pro"]),
  days: z.number().int().positive().nullable().optional(),
  max: z.number().int().positive().nullable().optional(),
  usable_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
  code: z.string().max(40).nullable().optional()
});

adminRouter.get("/admin/promo-codes", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    return res.json({ codes: await listPromoCodes() });
  } catch (error) {
    return sendError(res, 500, "Failed to list codes", error);
  }
});

adminRouter.post("/admin/promo-codes", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Check the plan, days, people and date." });
  }
  try {
    const { tier, days, max, usable_until, note, code } = parsed.data;
    return res.status(201).json({ code: await createPromoCode({ tier, days, max, usableUntil: usable_until, note, code: code?.trim() || null }) });
  } catch (error) {
    if (error instanceof PromoCodeError) return res.status(400).json({ error: error.message });
    return sendError(res, 500, "Failed to create code", error);
  }
});

adminRouter.post("/admin/promo-codes/:code/disable", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const done = await disablePromoCode(req.params.code);
    return done ? res.json({ disabled: true }) : res.status(404).json({ error: "No active code with that name." });
  } catch (error) {
    return sendError(res, 500, "Failed to disable code", error);
  }
});
