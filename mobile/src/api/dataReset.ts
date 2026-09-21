import { apiJson } from "./client";

// force: true is a deliberate second confirmation from the user after
// seeing the backend's warning (see POST /data-reset) — the first call
// omits it and can come back as a 409 (surfaced via the normal ApiError).
// skipped_locked_years lists any tax year the reset left untouched
// because it's explicitly locked (see taxYearLock.ts) — locked years are
// never reset, force included.
export async function resetAllData(force = false): Promise<{ success: true; skipped_locked_years: string[] }> {
  return apiJson("/data-reset", {
    method: "POST",
    body: JSON.stringify({ force })
  });
}
