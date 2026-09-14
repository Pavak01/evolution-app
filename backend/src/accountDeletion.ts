import { db } from "./db.js";

const GRACE_PERIOD_DAYS = 30;

// Qbit's own background job purges Qbit's tables (weekly_entries, its
// expenses/receipts, tax_summaries) for any user with deletion_status =
// 'pending', then marks deletion_status = 'completed' — but it has no
// knowledge of evolution.* and never will. This purges Evolution's own
// tables independently, keyed purely on deletion_requested_at age rather
// than the shared deletion_status value, specifically so it never races
// with Qbit's job flipping that status to 'completed' first (which would
// otherwise hide the row from a query gated on status = 'pending'). Does
// not touch the `users` row or `deletion_status` itself — that stays
// Qbit's job's responsibility, matching the account-shell-preserved
// pattern Qbit already established.
export async function processEvolutionAccountDeletions(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const usersToPurge = await db.query<{ id: string; email: string }>(
      `SELECT id, email FROM public.users
       WHERE deletion_requested_at IS NOT NULL AND deletion_requested_at <= $1`,
      [cutoff]
    );

    for (const user of usersToPurge.rows) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM receipts WHERE user_id = $1", [user.id]);
        await client.query("DELETE FROM expenses WHERE user_id = $1", [user.id]);
        await client.query("DELETE FROM income_invoices WHERE user_id = $1", [user.id]);
        await client.query("DELETE FROM tax_summaries WHERE user_id = $1", [user.id]);
        await client.query("COMMIT");
        console.log(`[Deletion] Purged Evolution data for ${user.email}`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`[Deletion] Failed to purge Evolution data for ${user.email}:`, error);
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error("[Deletion] Error in processEvolutionAccountDeletions:", error);
  }
}
