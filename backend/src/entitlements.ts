import { db } from "./db.js";

// Shared by the extraction route (gate) and GET /auth/me (so the mobile app
// knows on load without a separate round trip). Entitled = active and not
// past its expiry — NULL expiry means a manual grant that never expires.
export async function isOcrUpgradeActive(userId: string): Promise<boolean> {
  const result = await db.query<{ active: boolean }>(
    `SELECT (ocr_upgrade_active AND (ocr_upgrade_expires_at IS NULL OR ocr_upgrade_expires_at > NOW())) AS active
     FROM entitlements
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0]?.active ?? false;
}
