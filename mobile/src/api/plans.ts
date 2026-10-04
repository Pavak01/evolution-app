import type { Access } from "./auth";
import { apiJson } from "./client";

// Free-access codes (testers, promotions). `applied: false` means the code
// was valid but wouldn't improve the current plan, so nothing changed.
export async function redeemPromoCode(code: string): Promise<{ applied: boolean; message: string; access: Access }> {
  return apiJson<{ applied: boolean; message: string; access: Access }>("/promo/redeem", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}
