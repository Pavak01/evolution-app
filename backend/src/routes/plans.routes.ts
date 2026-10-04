import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { getAccess } from "../entitlements.js";
import { sendError } from "../middleware/errorHandler.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { promoRateLimit } from "../middleware/rateLimit.js";
import { normalizePromoCode } from "../promoCodes.js";

export const plansRouter = Router();

const redeemSchema = z.object({ code: z.string().min(1).max(64) });


const TIER_RANK = { basic: 1, pro: 2 } as const;

// Free-access codes (testers, promotions). Never makes anyone worse off:
// a code only applies if it's at least as good on BOTH tier and end date
// as the plan they already have; otherwise nothing changes and the code
// isn't used up. Refused outright alongside a store subscription, so it
// never fights Google's billing.
plansRouter.post("/promo/redeem", requireAuth, promoRateLimit, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a code." });
  }
  const code = normalizePromoCode(parsed.data.code);

  await getAccess(authReq.userId); // ensures the entitlements row exists
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      tier: "basic" | "pro";
      duration_days: number | null;
      max_redemptions: number | null;
      redeemed_count: number;
      expired: boolean;
      disabled: boolean;
    }>(
      `SELECT tier, duration_days, max_redemptions, redeemed_count,
              (expires_at IS NOT NULL AND expires_at <= NOW()) AS expired,
              (disabled_at IS NOT NULL) AS disabled
       FROM promo_codes WHERE code = $1 FOR UPDATE`,
      [code]
    );
    const promo = found.rows[0];
    const refuse = async (status: number, error: string) => {
      await client.query("ROLLBACK");
      return res.status(status).json({ error });
    };
    if (!promo || promo.disabled) return await refuse(404, "That code isn't valid.");
    if (promo.expired) return await refuse(410, "That code has expired.");
    if (promo.max_redemptions !== null && promo.redeemed_count >= promo.max_redemptions) {
      return await refuse(410, "That code has already been used the maximum number of times.");
    }
    const already = await client.query("SELECT 1 FROM promo_redemptions WHERE code = $1 AND user_id = $2", [code, authReq.userId]);
    if (already.rows.length > 0) return await refuse(409, "You've already used that code.");

    const current = await client.query<{
      plan: "basic" | "pro" | null;
      plan_source: string | null;
      plan_active: boolean;
      plan_expires_at: Date | null;
      new_expires_at: Date | null;
    }>(
      `SELECT plan, plan_source, plan_expires_at,
              (plan IS NOT NULL AND (plan_expires_at IS NULL OR plan_expires_at > NOW())) AS plan_active,
              CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() + make_interval(days => $2::int) END AS new_expires_at
       FROM entitlements WHERE user_id = $1 FOR UPDATE`,
      [authReq.userId, promo.duration_days]
    );
    const cur = current.rows[0];
    if (cur.plan_active && cur.plan_source === "revenuecat") {
      return await refuse(409, "You already have a plan through Google Play, so this code can't be used.");
    }
    if (cur.plan_active && cur.plan) {
      const tierOk = TIER_RANK[promo.tier] >= TIER_RANK[cur.plan];
      // null = no end, which beats any date.
      const endOk =
        cur.plan_expires_at === null
          ? cur.new_expires_at === null
          : cur.new_expires_at === null || cur.new_expires_at.getTime() >= cur.plan_expires_at.getTime();
      if (!(tierOk && endOk)) {
        await client.query("ROLLBACK");
        return res.json({ applied: false, message: "Your current plan already covers this, so nothing changed.", access: await getAccess(authReq.userId) });
      }
    }

    // Expiry computed in SQL, not round-tripped through a JS Date, so the
    // TIMESTAMP column never picks up the Node process's local offset.
    await client.query(
      `UPDATE entitlements
       SET plan = $2, plan_source = 'promo',
           plan_expires_at = CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() + make_interval(days => $3::int) END,
           updated_at = NOW()
       WHERE user_id = $1`,
      [authReq.userId, promo.tier, promo.duration_days]
    );
    await client.query("INSERT INTO promo_redemptions (code, user_id) VALUES ($1, $2)", [code, authReq.userId]);
    await client.query("UPDATE promo_codes SET redeemed_count = redeemed_count + 1 WHERE code = $1", [code]);
    await client.query("COMMIT");

    const access = await getAccess(authReq.userId);
    const tierName = promo.tier === "pro" ? "Pro" : "Basic";
    const until = access.plan_ends_at
      ? ` until ${new Date(access.plan_ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
      : "";
    return res.json({ applied: true, message: `${tierName} unlocked${until}.`, access });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return sendError(res, 500, "Failed to redeem code", error);
  } finally {
    client.release();
  }
});
