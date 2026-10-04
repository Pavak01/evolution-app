import { randomInt } from "node:crypto";
import { db } from "./db.js";

// Shared by the admin screen (routes/admin.routes.ts) and the Mac script
// (scripts/promo-code.ts), so codes are made and validated one way only.
// Codes are given away, never sold — selling access outside Play billing
// would break Google Play's payments policy.

// No look-alikes: 0/O, 1/I/L. 31^8 ≈ 850 billion codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const generatePromoCode = (): string => `EVO-${block()}-${block()}`;

// "evo-7k3m q9td " -> "EVO-7K3MQ9TD": case and stray spaces never matter.
export const normalizePromoCode = (input: string): string => input.replace(/\s+/g, "").toUpperCase();

export type PromoCodeInput = {
  tier: "basic" | "pro";
  days?: number | null; // null = no end
  max?: number | null; // null = unlimited people
  usableUntil?: string | null; // YYYY-MM-DD, inclusive; null = always
  note?: string | null;
  code?: string | null; // null = random
};

export type PromoCodeRow = {
  code: string;
  tier: "basic" | "pro";
  duration_days: number | null;
  max_redemptions: number | null;
  redeemed_count: number;
  usable_until: string | null;
  disabled: boolean;
  note: string | null;
  created_at: string;
};

const SELECT_COLUMNS = `code, tier, duration_days, max_redemptions, redeemed_count,
  to_char(expires_at - INTERVAL '1 day', 'YYYY-MM-DD') AS usable_until,
  disabled_at IS NOT NULL AS disabled, note, created_at::text`;

export class PromoCodeError extends Error {}

export async function createPromoCode(input: PromoCodeInput): Promise<PromoCodeRow> {
  const code = input.code ? normalizePromoCode(input.code) : generatePromoCode();
  if (!/^[A-Z0-9-]{4,32}$/.test(code)) throw new PromoCodeError("A code can only use letters, numbers and dashes (4 to 32 characters).");
  if (input.usableUntil && !/^\d{4}-\d{2}-\d{2}$/.test(input.usableUntil)) throw new PromoCodeError("The last usable date must be a date.");
  for (const [label, value] of [["Days", input.days], ["People", input.max]] as const) {
    if (value != null && !(Number.isInteger(value) && value > 0 && value <= 100_000)) throw new PromoCodeError(`${label} must be a whole number above 0.`);
  }
  const result = await db.query<PromoCodeRow>(
    `INSERT INTO promo_codes (code, tier, duration_days, max_redemptions, expires_at, note)
     VALUES ($1, $2, $3, $4, $5::date + INTERVAL '1 day', $6) -- usable through the whole of that date
     ON CONFLICT (code) DO NOTHING
     RETURNING ${SELECT_COLUMNS}`,
    [code, input.tier, input.days ?? null, input.max ?? null, input.usableUntil ?? null, input.note?.trim() || null]
  );
  if (result.rows.length === 0) throw new PromoCodeError(`The code ${code} already exists — choose another.`);
  return result.rows[0];
}

export async function listPromoCodes(): Promise<PromoCodeRow[]> {
  return (await db.query<PromoCodeRow>(`SELECT ${SELECT_COLUMNS} FROM promo_codes ORDER BY created_at DESC`)).rows;
}

export async function disablePromoCode(code: string): Promise<boolean> {
  const result = await db.query("UPDATE promo_codes SET disabled_at = NOW() WHERE code = $1 AND disabled_at IS NULL", [normalizePromoCode(code)]);
  return (result.rowCount ?? 0) > 0;
}

// Plain-English one-liner, used by the script and the admin screen's share text.
export function describePromoCode(row: PromoCodeRow): string {
  return [
    row.tier === "pro" ? "Pro" : "Basic",
    row.duration_days ? `${row.duration_days} days` : "no end",
    `used ${row.redeemed_count}${row.max_redemptions ? `/${row.max_redemptions}` : ""}`,
    row.usable_until ? `usable until ${row.usable_until}` : null,
    row.disabled ? "DISABLED" : null
  ]
    .filter(Boolean)
    .join(" · ");
}
