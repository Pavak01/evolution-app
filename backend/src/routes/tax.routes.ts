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

taxRouter.get("/tax-years/:taxYear/export", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const taxYear = req.params.taxYear;
  if (!taxYearParam.test(taxYear)) {
    return res.status(400).json({ error: "Invalid tax year, expected format YYYY-YY" });
  }
  const format = (req.query.format || "json").toString().toLowerCase();

  try {
    const summary = await recomputeTaxSummary(authReq.userId, taxYear);

    const categories = await db.query<{ category: string; total: string }>(
      `SELECT category, SUM(net_deductible_amount)::text AS total
       FROM expenses
       WHERE user_id = $1 AND tax_year = $2 AND voided_at IS NULL
       GROUP BY category
       ORDER BY category ASC`,
      [authReq.userId, taxYear]
    );

    const sources = await db.query<{ source: string }>(
      `SELECT DISTINCT source
       FROM income_invoices
       WHERE user_id = $1 AND tax_year = $2 AND voided_at IS NULL
       ORDER BY source ASC`,
      [authReq.userId, taxYear]
    );

    const payload = {
      tax_year: taxYear,
      total_income: summary.total_income,
      total_expenses: summary.total_expenses,
      net_profit: summary.net_profit,
      estimated_income_tax: summary.estimate.estimated_income_tax,
      estimated_ni: summary.estimate.estimated_ni,
      income_sources: sources.rows.map((row) => row.source),
      expenses_by_category: categories.rows.map((row) => ({ category: row.category, total: Number(row.total) }))
    };

    if (format === "csv") {
      const lines = [
        "field,value",
        `tax_year,${payload.tax_year}`,
        `total_income,${payload.total_income}`,
        `total_expenses,${payload.total_expenses}`,
        `net_profit,${payload.net_profit}`,
        `estimated_income_tax,${payload.estimated_income_tax}`,
        `estimated_ni,${payload.estimated_ni}`
      ];

      for (const source of payload.income_sources) {
        lines.push(`income_source,${source}`);
      }

      for (const category of payload.expenses_by_category) {
        lines.push(`expense_${category.category},${category.total}`);
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
