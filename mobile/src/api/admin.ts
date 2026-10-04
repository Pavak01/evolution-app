import { apiJson } from "./client";

// Admin-only (the server checks); see backend/src/routes/admin.routes.ts.
export type PromoCode = {
  code: string;
  tier: "basic" | "pro";
  duration_days: number | null;
  max_redemptions: number | null;
  redeemed_count: number;
  usable_until: string | null; // YYYY-MM-DD, inclusive
  disabled: boolean;
  note: string | null;
  created_at: string;
};

export type NewPromoCode = {
  tier: "basic" | "pro";
  days: number | null;
  max: number | null;
  usable_until: string | null;
  note: string | null;
  code: string | null;
};

export async function listPromoCodes(): Promise<PromoCode[]> {
  return (await apiJson<{ codes: PromoCode[] }>("/admin/promo-codes")).codes;
}

export async function createPromoCode(input: NewPromoCode): Promise<PromoCode> {
  return (await apiJson<{ code: PromoCode }>("/admin/promo-codes", { method: "POST", body: JSON.stringify(input) })).code;
}

export async function disablePromoCode(code: string): Promise<void> {
  await apiJson(`/admin/promo-codes/${encodeURIComponent(code)}/disable`, { method: "POST" });
}
