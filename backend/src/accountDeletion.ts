import { db } from "./db.js";
import { deleteReceiptObjects } from "./receiptStorage.js";

const GRACE_PERIOD_DAYS = 30;

// Every evolution.* table holding a user's data (order matters: receipts
// before expenses). Keep in step with scripts/smoke-test.ts cleanup. To
// audit: SELECT table_name FROM information_schema.columns
//        WHERE table_schema = 'evolution' AND column_name = 'user_id';
// (admin_users and entitlements are handled separately below.)
const PURGED_TABLES = [
  "receipts",
  "expenses",
  "income_invoices",
  "tax_summaries",
  "filed_tax_years",
  "export_events",
  "promo_redemptions",
  "email_codes",
  "email_verifications",
  "terms_acceptances",
  "two_factor_backup_codes",
  "hmrc_connections",
  "hmrc_oauth_states",
  "hmrc_submissions",
  "hmrc_year_ends",
  "mfa_events"
];

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
      // Stored files first (receipt photos, invoices, locked-year archive
      // copies): the privacy policy promises they go too, not just the
      // database rows pointing at them. Done before the rows so a failure
      // leaves the paths in place for the next daily run to retry.
      const files = await db.query<{ key: string }>(
        `SELECT storage_path AS key FROM receipts WHERE user_id = $1
         UNION SELECT invoice_storage_path FROM income_invoices WHERE user_id = $1 AND invoice_storage_path IS NOT NULL
         UNION SELECT archive_storage_path FROM filed_tax_years WHERE user_id = $1
         UNION SELECT archive_pdf_storage_path FROM filed_tax_years WHERE user_id = $1 AND archive_pdf_storage_path IS NOT NULL`,
        [user.id]
      );
      if (files.rows.length > 0) {
        await deleteReceiptObjects(files.rows.map((row) => row.key));
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (const table of PURGED_TABLES) {
          await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [user.id]);
        }
        // Admin (staff) accounts are managed by hand: their admin role and
        // any manually granted plan stay until removed deliberately, so a
        // test deletion of a staff account can be reinstated.
        const isAdmin = (await client.query("SELECT 1 FROM admin_users WHERE user_id = $1", [user.id])).rows.length > 0;
        if (!isAdmin) {
          await client.query("DELETE FROM entitlements WHERE user_id = $1", [user.id]);
        }
        await client.query("COMMIT");
        console.log(`[Deletion] Purged Evolution data for ${user.email} (${files.rows.length} stored files)`);
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
