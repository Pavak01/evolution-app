import type { NextFunction, Request, Response } from "express";
import { db } from "./db.js";
import type { AuthenticatedRequest } from "./middleware/auth.js";

// Plans (agreed 2026-10-04): a 1-calendar-month free trial with everything
// unlocked, from first Evolution use; then Basic (manual) or Pro (Basic +
// anything that reads a photo/PDF for you: receipt/invoice auto-fill,
// Import past receipts). With no plan after the trial, records stay
// viewable/exportable/deletable but nothing new can be added.
export const TRIAL_LENGTH = "1 month";

export type Tier = "trial" | "basic" | "pro" | "none";
export type PlanSource = "manual" | "promo" | "revenuecat";

export type Access = {
  tier: Tier;
  trial_ends_at: string | null;
  plan_ends_at: string | null; // null with an active plan = no end
  plan_source: PlanSource | null;
  can_write: boolean;
  ocr: boolean;
};

// Starts the trial on first Evolution use. Never derived from
// users.created_at — public.users is shared with Qbit's old accounts.
export async function ensureTrialStarted(userId: string): Promise<void> {
  await db.query(
    `INSERT INTO entitlements (user_id, trial_started_at, updated_at)
     VALUES ($1, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET trial_started_at = NOW(), updated_at = NOW()
       WHERE entitlements.trial_started_at IS NULL`,
    [userId]
  );
}

export async function getAccess(userId: string): Promise<Access> {
  await ensureTrialStarted(userId);
  const result = await db.query<{
    plan: "basic" | "pro" | null;
    plan_source: PlanSource | null;
    plan_expires_at: Date | null;
    plan_active: boolean;
    trial_ends_at: Date;
    trial_active: boolean;
  }>(
    `SELECT plan, plan_source,
            -- TIMESTAMP columns hold the DB session's local time; AT TIME ZONE
            -- turns them into real instants so clients get unambiguous UTC.
            plan_expires_at AT TIME ZONE current_setting('TimeZone') AS plan_expires_at,
            (plan IS NOT NULL AND (plan_expires_at IS NULL OR plan_expires_at > NOW())) AS plan_active,
            (trial_started_at + INTERVAL '${TRIAL_LENGTH}') AT TIME ZONE current_setting('TimeZone') AS trial_ends_at,
            (trial_started_at + INTERVAL '${TRIAL_LENGTH}' > NOW()) AS trial_active
     FROM entitlements WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const row = result.rows[0];
  // An active plan always wins over the trial.
  const tier: Tier = row.plan_active && row.plan ? row.plan : row.trial_active ? "trial" : "none";
  return {
    tier,
    trial_ends_at: row.trial_ends_at.toISOString(),
    plan_ends_at: row.plan_active && row.plan_expires_at ? row.plan_expires_at.toISOString() : null,
    plan_source: row.plan_active ? row.plan_source : null,
    can_write: tier !== "none",
    ocr: tier === "trial" || tier === "pro"
  };
}

// Kept so the extraction routes and build 110's `ocr_upgrade_active` field
// keep working unchanged — Pro (or the trial) is what grants OCR now.
export async function isOcrUpgradeActive(userId: string): Promise<boolean> {
  return (await getAccess(userId)).ocr;
}

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "Your free trial has ended — choose a plan to keep adding records. Everything you've logged is still here to view and export.";

// On every route that adds or changes records. Reads (GETs), export,
// lock/unlock, data reset and account deletion deliberately never use it —
// tax records are never held hostage.
export async function requireWriteAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const access = await getAccess((req as AuthenticatedRequest).userId);
    if (!access.can_write) {
      res.status(402).json({ error: SUBSCRIPTION_REQUIRED_MESSAGE, code: "SUBSCRIPTION_REQUIRED" });
      return;
    }
    next();
  } catch (error) {
    console.error("Failed to check plan access", error);
    res.status(500).json({ error: "Failed to check plan access" });
  }
}
