import { apiJson } from "./client";

// force: true is a deliberate second confirmation from the user after
// seeing the backend's warning (see POST /data-reset) — the first call
// omits it and can come back as a 409 (surfaced via the normal ApiError).
export async function resetAllData(force = false): Promise<{ success: true }> {
  return apiJson("/data-reset", {
    method: "POST",
    body: JSON.stringify({ force })
  });
}
