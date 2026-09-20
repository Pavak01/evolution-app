import { Router, type Request, type Response } from "express";
import { db } from "../db.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { sendError } from "../middleware/errorHandler.js";
import { getRuleMonitoringSnapshot } from "../rulesEngine.js";
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

taxRouter.get("/tax-years/:taxYear/export", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const taxYear = req.params.taxYear;
  if (!taxYearParam.test(taxYear)) {
    return res.status(400).json({ error: "Invalid tax year, expected format YYYY-YY" });
  }
  const format = (req.query.format || "json").toString().toLowerCase();

  try {
    const summary = await recomputeTaxSummary(authReq.userId, taxYear);

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
      [authReq.userId, taxYear]
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
      [authReq.userId, taxYear]
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
          ? `${pendingCount} travel expense${pendingCount === 1 ? "" : "s"} in this export ${pendingCount === 1 ? "is" : "are"} still awaiting a receipt and excluded from the box totals above until proof is attached — see expense_line_items for which ones.`
          : null,
      income_line_items: incomeLineItems,
      expense_line_items: expenseLineItems
    };

    if (format === "csv") {
      const lines = [
        "field,value",
        `tax_year,${payload.tax_year}`,
        `total_income,${payload.totals.total_income}`,
        `total_expenses,${payload.totals.total_expenses}`,
        `net_profit,${payload.totals.net_profit}`,
        `estimated_income_tax_planning_estimate_not_for_return,${payload.planning_estimates_not_for_return.estimated_income_tax}`,
        `estimated_ni_planning_estimate_not_for_return,${payload.planning_estimates_not_for_return.estimated_ni}`,
        ""
      ];

      lines.push("SA103S box,label,total");
      for (const row of payload.self_assessment_sa103s_boxes) {
        lines.push([row.box, csvField(row.label), row.total].join(","));
      }
      if (payload.pending_receipt_note) {
        lines.push(`note,${csvField(payload.pending_receipt_note)}`);
      }
      lines.push("");

      lines.push("Income line items");
      lines.push("date,source,period_start,period_end,total_amount,notes");
      for (const item of payload.income_line_items) {
        lines.push(
          [item.received_date, csvField(item.source), item.period_start, item.period_end, item.total_amount, csvField(item.notes ?? "")].join(",")
        );
      }
      lines.push("");

      lines.push("Expense line items");
      lines.push(
        "date,category,sa103s_box,total_amount,reimbursed_amount,net_deductible_amount,business_use_percent,payment_method,counted_in_return,notes"
      );
      for (const item of payload.expense_line_items) {
        lines.push(
          [
            item.occurred_at,
            csvField(item.category),
            item.sa103s_box,
            item.total_amount,
            item.reimbursed_amount,
            item.net_deductible_amount,
            item.business_use_percent,
            item.payment_method,
            item.counted_in_return,
            csvField(item.notes ?? "")
          ].join(",")
        );
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=self-assessment-${taxYear}.csv`);
      return res.send(lines.join("\n"));
    }

    return res.json(payload);
  } catch (error) {
    return sendError(res, 500, "Export failed", error);
  }
});
