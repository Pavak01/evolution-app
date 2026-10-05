import { db } from "./db.js";

// Must match the "Version:" line at the top of TERMS-OF-USE.md. Bumping it
// (for a material change) makes the app ask every account to accept again.
export const CURRENT_TERMS_VERSION = "2026-10-05";

export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const result = await db.query("SELECT 1 FROM terms_acceptances WHERE user_id = $1 AND version = $2", [userId, CURRENT_TERMS_VERSION]);
  return result.rows.length > 0;
}

export async function recordTermsAcceptance(userId: string, version: string): Promise<boolean> {
  if (version !== CURRENT_TERMS_VERSION) return false;
  await db.query("INSERT INTO terms_acceptances (user_id, version) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, version]);
  return true;
}
