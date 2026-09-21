import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { humanizeCategory } from "../categoryDisplay.js";
import { db } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { sendError } from "../middleware/errorHandler.js";
import { deleteReceiptObjects, getReceiptPresignedUrl, uploadReceiptObject } from "../receiptStorage.js";
import { getRuleMonitoringSnapshot, hasFilingDeadlinePassed } from "../rulesEngine.js";
import { recomputeTaxSummary } from "../taxSummary.js";

export const taxRouter = Router();

const taxYearParam = /^\d{4}-\d{2}$/;

taxRouter.get("/tax-years/:taxYear/summary", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const taxYear = req.params.taxYear;
  if (!taxYearParam.test(taxYear)) {
    return res.status(400).json({ error: "Invalid tax year, expected format YYYY-YY" });
  }

  try {
    const summary = await recomputeTaxSummary(authReq.userId, taxYear);
    return res.json(summary);
  } catch (error) {
    return sendError(res, 500, "Failed to load tax summary", error);
  }
});

taxRouter.get("/tax-years/:taxYear/rules-monitoring", requireAuth, async (req: Request, res: Response) => {
  const taxYear = req.params.taxYear;
  if (!taxYearParam.test(taxYear)) {
    return res.status(400).json({ error: "Invalid tax year, expected format YYYY-YY" });
  }

  try {
    const snapshot = await getRuleMonitoringSnapshot(taxYear);
    return res.json(snapshot);
  } catch (error) {
    return sendError(res, 500, "Failed to load rules monitoring", error);
  }
});

// Maps this app's own category names onto HMRC's SA103S (Self-employment
// short form) expense boxes — the form's own line items don't match our
// categories 1:1 (e.g. fuel/vehicle_maintenance/parking_tolls/travel all
// combine into one "car, van and travel expenses" box). Only the boxes
// relevant to a sole trader with no staff/stock/loans are used; anything
// that doesn't clearly fit a specific box (ppe, food, a custom category)
// falls to "other business expenses", same as HMRC's own catch-all.
const SA103S_BOXES: Record<string, { box: string; label: string }> = {
  fuel: { box: "box_10", label: "Box 10 — Car, van and travel expenses" },
  travel: { box: "box_10", label: "Box 10 — Car, van and travel expenses" },
  parking_tolls: { box: "box_10", label: "Box 10 — Car, van and travel expenses" },
  vehicle_maintenance: { box: "box_10", label: "Box 10 — Car, van and travel expenses" },
  phone: { box: "box_14", label: "Box 14 — Phone, fax, stationery and other office costs" },
  home_office: { box: "box_14", label: "Box 14 — Phone, fax, stationery and other office costs" },
  accountancy: { box: "box_19", label: "Box 19 — Accountancy, legal and other professional fees" }
};
const DEFAULT_SA103S_BOX = { box: "box_21", label: "Box 21 — Other business expenses" };

function mapCategoryToSa103sBox(category: string): { box: string; label: string } {
  return SA103S_BOXES[category.trim().toLowerCase()] ?? DEFAULT_SA103S_BOX;
}

const csvField = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

// Builds both the JSON payload and the CSV text for a tax year's export —
// shared by GET /tax-years/:taxYear/export and POST .../lock, so the
// archived snapshot a lock creates is byte-identical to a manual export
// taken at that same moment.
async function buildTaxYearExport(userId: string, taxYear: string): Promise<{ payload: Record<string, unknown>; csv: string }> {
  const summary = await recomputeTaxSummary(userId, taxYear);

  // counted_in_return mirrors recomputeTaxSummary's own "no proof, no
  // claim" rule (see taxSummary.ts) — a travel expense saved without a
  // receipt yet still appears in the itemized backup below (so nothing
  // is silently hidden), but is excluded from every box total and
  // labelled as not yet counted, exactly like it's excluded from
  // total_expenses/net_profit today.
  const expenseRows = await db.query<{
    id: string;
    category: string;
    occurred_at: string;
    payment_method: string;
    total_amount: string;
    reimbursed_amount: string;
    net_deductible_amount: string;
    business_use_percent: string;
    notes: string | null;
    counted_in_return: boolean;
  }>(
    `SELECT e.id, e.category, e.occurred_at::text, e.payment_method, e.total_amount::text,
            e.reimbursed_amount::text, e.net_deductible_amount::text, e.business_use_percent::text, e.notes,
            (r.id IS NOT NULL) AS counted_in_return
     FROM expenses e
     LEFT JOIN receipts r ON r.expense_id = e.id
     WHERE e.user_id = $1 AND e.tax_year = $2 AND e.voided_at IS NULL
     ORDER BY e.occurred_at ASC, e.created_at ASC`,
    [userId, taxYear]
  );

  const incomeRows = await db.query<{
    id: string;
    source: string;
    period_start: string;
    period_end: string;
    received_date: string;
    total_amount: string;
    notes: string | null;
  }>(
    `SELECT id, source, period_start::text, period_end::text, received_date::text, total_amount::text, notes
     FROM income_invoices
     WHERE user_id = $1 AND tax_year = $2 AND voided_at IS NULL
     ORDER BY received_date ASC, created_at ASC`,
    [userId, taxYear]
  );

  const expenseLineItems = expenseRows.rows.map((row) => {
    const sa103s = mapCategoryToSa103sBox(row.category);
    return {
      id: row.id,
      occurred_at: row.occurred_at,
      category: row.category,
      sa103s_box: sa103s.box,
      sa103s_box_label: sa103s.label,
      payment_method: row.payment_method,
      total_amount: Number(row.total_amount),
      reimbursed_amount: Number(row.reimbursed_amount),
      net_deductible_amount: Number(row.net_deductible_amount),
      business_use_percent: Number(row.business_use_percent),
      notes: row.notes,
      counted_in_return: row.counted_in_return
    };
  });

  const boxTotals = new Map<string, { label: string; total: number }>();
  for (const item of expenseLineItems) {
    if (!item.counted_in_return) continue; // matches total_expenses/net_profit excluding these
    const existing = boxTotals.get(item.sa103s_box);
    const total = (existing?.total ?? 0) + item.net_deductible_amount;
    boxTotals.set(item.sa103s_box, { label: item.sa103s_box_label, total: Math.round(total * 100) / 100 });
  }

  const incomeLineItems = incomeRows.rows.map((row) => ({
    id: row.id,
    source: row.source,
    period_start: row.period_start,
    period_end: row.period_end,
    received_date: row.received_date,
    total_amount: Number(row.total_amount),
    notes: row.notes
  }));

  const pendingCount = expenseLineItems.filter((item) => !item.counted_in_return).length;

  const payload = {
    tax_year: taxYear,
    totals: {
      total_income: summary.total_income,
      total_expenses: summary.total_expenses,
      net_profit: summary.net_profit
    },
    // Named and separated deliberately — these are Evolution's own
    // planning estimates to help you set money aside, not figures HMRC's
    // form asks for or that belong copied into the return itself.
    planning_estimates_not_for_return: {
      estimated_income_tax: summary.estimate.estimated_income_tax,
      estimated_ni: summary.estimate.estimated_ni
    },
    self_assessment_sa103s_boxes: Array.from(boxTotals.entries()).map(([box, { label, total }]) => ({
      box,
      label,
      total
    })),
    pending_receipt_note:
      pendingCount > 0
        ? `${pendingCount} travel expense${pendingCount === 1 ? "" : "s"} in this export ${pendingCount === 1 ? "is" : "are"} still awaiting a receipt and excluded from the box totals above until proof is attached — see the expense list below for which ones.`
        : null,
    income_line_items: incomeLineItems,
    expense_line_items: expenseLineItems
  };

  // Every header and value here is something a person reads directly —
  // never the app's own snake_case identifiers (those stay internal to
  // the JSON payload above, which is machine-oriented by convention).
  const lines = [
    "Field,Value",
    `Tax year,${payload.tax_year}`,
    `Total income,${payload.totals.total_income}`,
    `Total expenses,${payload.totals.total_expenses}`,
    `Net profit,${payload.totals.net_profit}`,
    `Estimated income tax (planning estimate — not a return figure),${payload.planning_estimates_not_for_return.estimated_income_tax}`,
    `Estimated NI (planning estimate — not a return figure),${payload.planning_estimates_not_for_return.estimated_ni}`,
    ""
  ];

  lines.push("SA103S box,Total");
  for (const row of payload.self_assessment_sa103s_boxes) {
    lines.push([csvField(row.label), row.total].join(","));
  }
  if (payload.pending_receipt_note) {
    lines.push(`Note,${csvField(payload.pending_receipt_note)}`);
  }
  lines.push("");

  lines.push("Income");
  lines.push("Date,Source,Period start,Period end,Total amount,Notes");
  for (const item of payload.income_line_items) {
    lines.push(
      [item.received_date, csvField(item.source), item.period_start, item.period_end, item.total_amount, csvField(item.notes ?? "")].join(",")
    );
  }
  lines.push("");

  lines.push("Expenses");
  lines.push("Date,Category,SA103S box,Total amount,Reimbursed amount,Net deductible amount,Business use %,Payment method,Counted in return,Notes");
  for (const item of payload.expense_line_items) {
    lines.push(
      [
        item.occurred_at,
        csvField(humanizeCategory(item.category)),
        csvField(item.sa103s_box_label),
        item.total_amount,
        item.reimbursed_amount,
        item.net_deductible_amount,
        item.business_use_percent,
        item.payment_method === "card" ? "Card" : "Cash",
        item.counted_in_return ? "Yes" : "No",
        csvField(item.notes ?? "")
      ].join(",")
    );
  }

  return { payload, csv: lines.join("\n") };
}

taxRouter.get("/tax-years/:taxYear/export", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const taxYear = req.params.taxYear;
  if (!taxYearParam.test(taxYear)) {
    return res.status(400).json({ error: "Invalid tax year, expected format YYYY-YY" });
  }
  const format = (req.query.format || "json").toString().toLowerCase();

  try {
    const { payload, csv } = await buildTaxYearExport(authReq.userId, taxYear);

    // Records that this tax year was actually exported — the closest real
    // signal available for POST /data-reset's safety check, given there's
    // no HMRC/MTD integration to know whether a return was actually filed.
    // Best-effort: never let a logging failure break the export itself.
    db.query("INSERT INTO export_events (user_id, tax_year) VALUES ($1, $2)", [authReq.userId, taxYear]).catch(() => {});

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=self-assessment-${taxYear}.csv`);
      return res.send(csv);
    }

    return res.json(payload);
  } catch (error) {
    return sendError(res, 500, "Export failed", error);
  }
});

taxRouter.post("/tax-years/:taxYear/lock", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const taxYear = req.params.taxYear;
  if (!taxYearParam.test(taxYear)) {
    return res.status(400).json({ error: "Invalid tax year, expected format YYYY-YY" });
  }

  try {
    const existing = await db.query<{ locked_at: string }>(
      "SELECT locked_at::text FROM filed_tax_years WHERE user_id = $1 AND tax_year = $2 AND unlocked_at IS NULL LIMIT 1",
      [authReq.userId, taxYear]
    );
    if (existing.rows.length > 0) {
      return res.json({ locked: true, locked_at: existing.rows[0].locked_at });
    }

    const { csv } = await buildTaxYearExport(authReq.userId, taxYear);
    const storageKey = `filed-snapshots/${authReq.userId}/${taxYear}-${Date.now()}.csv`;
    await uploadReceiptObject(storageKey, Buffer.from(csv, "utf-8"), "text/csv");

    const inserted = await db.query<{ locked_at: string }>(
      `INSERT INTO filed_tax_years (user_id, tax_year, archive_storage_path)
       VALUES ($1, $2, $3)
       RETURNING locked_at::text`,
      [authReq.userId, taxYear, storageKey]
    );

    return res.json({ locked: true, locked_at: inserted.rows[0].locked_at });
  } catch (error) {
    return sendError(res, 500, "Failed to lock tax year", error);
  }
});

taxRouter.post("/tax-years/:taxYear/unlock", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const taxYear = req.params.taxYear;
  if (!taxYearParam.test(taxYear)) {
    return res.status(400).json({ error: "Invalid tax year, expected format YYYY-YY" });
  }

  try {
    const result = await db.query(
      "UPDATE filed_tax_years SET unlocked_at = NOW() WHERE user_id = $1 AND tax_year = $2 AND unlocked_at IS NULL",
      [authReq.userId, taxYear]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "This tax year isn't locked" });
    }
    return res.json({ unlocked: true });
  } catch (error) {
    return sendError(res, 500, "Failed to unlock tax year", error);
  }
});

taxRouter.get("/tax-years/:taxYear/lock-status", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const taxYear = req.params.taxYear;
  if (!taxYearParam.test(taxYear)) {
    return res.status(400).json({ error: "Invalid tax year, expected format YYYY-YY" });
  }

  try {
    const result = await db.query<{ locked_at: string; archive_storage_path: string }>(
      "SELECT locked_at::text, archive_storage_path FROM filed_tax_years WHERE user_id = $1 AND tax_year = $2 AND unlocked_at IS NULL LIMIT 1",
      [authReq.userId, taxYear]
    );

    if (result.rows.length === 0) {
      return res.json({ locked: false, locked_at: null, archive_download_url: null });
    }

    const row = result.rows[0];
    const archiveUrl = await getReceiptPresignedUrl(row.archive_storage_path, `self-assessment-${taxYear}-filed.csv`);
    return res.json({ locked: true, locked_at: row.locked_at, archive_download_url: archiveUrl });
  } catch (error) {
    return sendError(res, 500, "Failed to load lock status", error);
  }
});

const dataResetSchema = z.object({ force: z.boolean().optional() });

// Wipes every expense, income record, and receipt for this account — not
// the account itself (see accountDeletion.ts for that) — except any tax
// year the user has explicitly locked (POST .../lock), which this never
// touches under any circumstances, force included; unlocking is the only
// way to make a locked year eligible again. For everything else, this is
// guarded rather than blocked: a tax year that's both past its filing
// deadline and has been exported at least once gets a warning on the
// first call; force: true (a deliberate second confirmation on the
// client) proceeds anyway. That's intentionally an AND, not a date check
// alone — a blanket "any old tax year blocks this" rule would trap
// stray/never-exported test data forever, with no way to ever use the
// feature again.
taxRouter.post("/data-reset", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = dataResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  const force = parsed.data.force ?? false;

  try {
    const lockedRows = await db.query<{ tax_year: string }>(
      "SELECT tax_year FROM filed_tax_years WHERE user_id = $1 AND unlocked_at IS NULL",
      [authReq.userId]
    );
    const lockedYears = lockedRows.rows.map((row) => row.tax_year);

    const taxYearRows = await db.query<{ tax_year: string }>(
      `SELECT tax_year FROM expenses WHERE user_id = $1
       UNION
       SELECT tax_year FROM income_invoices WHERE user_id = $1`,
      [authReq.userId]
    );
    const resettableYears = taxYearRows.rows.map((row) => row.tax_year).filter((year) => !lockedYears.includes(year));

    if (!force) {
      const flaggedYears: string[] = [];
      for (const year of resettableYears) {
        if (!hasFilingDeadlinePassed(year)) continue;
        const exported = await db.query("SELECT 1 FROM export_events WHERE user_id = $1 AND tax_year = $2 LIMIT 1", [authReq.userId, year]);
        if (exported.rows.length > 0) {
          flaggedYears.push(year);
        }
      }

      if (flaggedYears.length > 0) {
        const years = flaggedYears.sort().join(", ");
        return res.status(409).json({
          error: `${years} ${flaggedYears.length === 1 ? "has" : "have"} already been exported and ${flaggedYears.length === 1 ? "is" : "are"} past HMRC's filing deadline — resetting will delete the records behind it. Export a backup first if you need one, or confirm again to reset anyway.`
        });
      }
    }

    const receiptFiles = await db.query<{ storage_path: string }>(
      `SELECT r.storage_path FROM receipts r
       JOIN expenses e ON e.id = r.expense_id
       WHERE r.user_id = $1 AND NOT (e.tax_year = ANY($2::text[]))`,
      [authReq.userId, lockedYears]
    );
    const invoiceFiles = await db.query<{ invoice_storage_path: string | null }>(
      `SELECT invoice_storage_path FROM income_invoices
       WHERE user_id = $1 AND invoice_storage_path IS NOT NULL AND NOT (tax_year = ANY($2::text[]))`,
      [authReq.userId, lockedYears]
    );
    const storageKeys = [
      ...receiptFiles.rows.map((row) => row.storage_path),
      ...invoiceFiles.rows.map((row) => row.invoice_storage_path as string)
    ];

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM receipts WHERE user_id = $1 AND expense_id IN (
           SELECT id FROM expenses WHERE user_id = $1 AND NOT (tax_year = ANY($2::text[]))
         )`,
        [authReq.userId, lockedYears]
      );
      await client.query("DELETE FROM expenses WHERE user_id = $1 AND NOT (tax_year = ANY($2::text[]))", [authReq.userId, lockedYears]);
      await client.query("DELETE FROM income_invoices WHERE user_id = $1 AND NOT (tax_year = ANY($2::text[]))", [authReq.userId, lockedYears]);
      await client.query("DELETE FROM tax_summaries WHERE user_id = $1 AND NOT (tax_year = ANY($2::text[]))", [authReq.userId, lockedYears]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (storageKeys.length > 0) {
      await deleteReceiptObjects(storageKeys).catch(() => {});
    }

    return res.json({ success: true, skipped_locked_years: lockedYears.filter((year) => taxYearRows.rows.some((row) => row.tax_year === year)) });
  } catch (error) {
    return sendError(res, 500, "Failed to reset data", error);
  }
});
