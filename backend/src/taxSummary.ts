import { db } from "./db.js";
import { computeWeeksLoggedFromInvoices, getTaxYearBounds } from "./incomeAggregation.js";
import { getRulesForTaxYear } from "./rulesEngine.js";
import { calculateTaxEstimate, generateComplianceWarnings, type TaxEstimate } from "./taxEngine.js";
import type { ComplianceWarning } from "./types.js";

export type TaxSummaryResult = {
  tax_year: string;
  total_income: number;
  total_expenses: number;
  pending_deductible_amount: number;
  net_profit: number;
  weeks_logged: number;
  estimate: TaxEstimate;
  warnings: ComplianceWarning[];
  rule_set: { id: string; version: number; source_reference: string | null };
};

export async function recomputeTaxSummary(userId: string, taxYear: string): Promise<TaxSummaryResult> {
  const { start: taxYearStart, end: taxYearEnd } = getTaxYearBounds(taxYear);

  // net_deductible_amount only counts toward the claimable total for
  // expenses that actually have a receipt attached — "without proof, there
  // can be no claim". A travel expense saved without one yet (see
  // POST /expenses) still shows up here as pending_deductible_amount so the
  // user can see what attaching proof would unlock, but it doesn't reduce
  // total_expenses/net_profit/the tax estimate until they complete it.
  const expenseTotals = await db.query<{
    total_amount: string;
    reimbursed_amount: string;
    net_deductible_amount: string;
    pending_deductible_amount: string;
    has_food: boolean;
  }>(
    `SELECT
       COALESCE(SUM(e.total_amount), 0)::text AS total_amount,
       COALESCE(SUM(e.reimbursed_amount), 0)::text AS reimbursed_amount,
       COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN e.net_deductible_amount ELSE 0 END), 0)::text AS net_deductible_amount,
       COALESCE(SUM(CASE WHEN r.id IS NULL THEN e.net_deductible_amount ELSE 0 END), 0)::text AS pending_deductible_amount,
       BOOL_OR(LOWER(e.category) = 'food') AS has_food
     FROM expenses e
     LEFT JOIN receipts r ON r.expense_id = e.id
     WHERE e.user_id = $1 AND e.tax_year = $2 AND e.voided_at IS NULL`,
    [userId, taxYear]
  );

  const incomeTotal = await db.query<{ total_amount: string }>(
    `SELECT COALESCE(SUM(total_amount), 0)::text AS total_amount
     FROM income_invoices
     WHERE user_id = $1 AND tax_year = $2 AND voided_at IS NULL`,
    [userId, taxYear]
  );

  // Weeks logged uses period overlap, not the tax_year column — see
  // incomeAggregation.ts for why a straddling invoice must be handled this way.
  const overlappingInvoices = await db.query<{ period_start: string; period_end: string }>(
    `SELECT period_start::text, period_end::text
     FROM income_invoices
     WHERE user_id = $1 AND voided_at IS NULL
       AND period_start <= $3 AND period_end >= $2`,
    [userId, taxYearStart, taxYearEnd]
  );

  const totalExpenseAmount = Number(expenseTotals.rows[0].total_amount);
  const totalReimbursedAmount = Number(expenseTotals.rows[0].reimbursed_amount);
  const totalExpenses = Number(expenseTotals.rows[0].net_deductible_amount);
  const pendingDeductibleAmount = Number(expenseTotals.rows[0].pending_deductible_amount);
  const hasFoodExpense = expenseTotals.rows[0].has_food;
  const totalIncome = Number(incomeTotal.rows[0].total_amount);
  const netProfit = totalIncome - totalExpenses;
  const weeksLogged = computeWeeksLoggedFromInvoices(overlappingInvoices.rows, taxYear);

  const rules = await getRulesForTaxYear(taxYear);
  const estimate = calculateTaxEstimate({ annualProfit: netProfit, weeksLogged, rules });
  const warnings = generateComplianceWarnings({
    annualProfit: netProfit,
    weeksLogged,
    totalExpenseAmount,
    totalReimbursedAmount,
    hasFoodExpense,
    pendingDeductibleAmount,
    excessReimbursement: 0
  });

  await db.query(
    `INSERT INTO tax_summaries (
       user_id, tax_year, total_income, total_expenses, net_profit, weeks_logged,
       rule_set_id, estimated_income_tax, estimated_ni, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id, tax_year)
     DO UPDATE SET
       total_income = EXCLUDED.total_income,
       total_expenses = EXCLUDED.total_expenses,
       net_profit = EXCLUDED.net_profit,
       weeks_logged = EXCLUDED.weeks_logged,
       rule_set_id = EXCLUDED.rule_set_id,
       estimated_income_tax = EXCLUDED.estimated_income_tax,
       estimated_ni = EXCLUDED.estimated_ni,
       updated_at = NOW()`,
    [userId, taxYear, totalIncome, totalExpenses, netProfit, weeksLogged, rules.id, estimate.estimated_income_tax, estimate.estimated_ni]
  );

  return {
    tax_year: taxYear,
    total_income: totalIncome,
    total_expenses: totalExpenses,
    pending_deductible_amount: pendingDeductibleAmount,
    net_profit: netProfit,
    weeks_logged: weeksLogged,
    estimate,
    warnings,
    rule_set: { id: rules.id, version: rules.version, source_reference: rules.source_reference }
  };
}
