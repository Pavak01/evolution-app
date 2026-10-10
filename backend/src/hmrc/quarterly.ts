import { db } from "../db.js";
import { getTaxYearFromDate } from "../rulesEngine.js";

// Builds a Making Tax Digital cumulative quarterly update from the user's
// own Evolution records — always on the server, never from figures the
// phone sends, so what reaches HMRC is exactly what the records say.
//
// Cash basis, matching the Summary screen and the export:
// - income counts on the date it was received;
// - an expense counts on the date it was paid, at its allowable amount
//   (business share minus any reimbursement — net_deductible_amount);
// - voided entries are left out;
// - travel still waiting for a receipt is left out ("no proof, no claim"),
//   exactly as the Summary does, and is reported back so the user sees it.

// Evolution category → HMRC Self Employment Business API expense field.
// Same grouping as the SA103S boxes in the export (routes/tax.routes.ts).
const HMRC_EXPENSE_FIELD: Record<string, HmrcExpenseField> = {
  fuel: "carVanTravelExpenses",
  travel: "carVanTravelExpenses",
  parking_tolls: "carVanTravelExpenses",
  vehicle_maintenance: "carVanTravelExpenses",
  phone: "adminCosts",
  home_office: "adminCosts",
  accountancy: "professionalFees"
};
const DEFAULT_FIELD: HmrcExpenseField = "otherExpenses";

type HmrcExpenseField = "carVanTravelExpenses" | "adminCosts" | "professionalFees" | "otherExpenses";

export type QuarterlyTotals = {
  tax_year: string;
  period_start: string;
  period_end: string;
  turnover: number;
  expenses: Record<HmrcExpenseField, number>;
  total_expenses: number;
  income_count: number;
  expense_count: number;
  awaiting_receipt_count: number;
  awaiting_receipt_amount: number;
};

const pennies = (value: string | number) => Math.round(Number(value) * 100);

export async function buildQuarterlyTotals(userId: string, periodStart: string, periodEnd: string): Promise<QuarterlyTotals> {
  const taxYear = getTaxYearFromDate(periodStart);
  if (getTaxYearFromDate(periodEnd) !== taxYear) throw new Error("A quarterly update must stay within one tax year");

  const income = await db.query<{ total: string; count: string }>(
    `SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::text AS count
     FROM income_invoices
     WHERE user_id = $1 AND voided_at IS NULL AND received_date BETWEEN $2 AND $3`,
    [userId, periodStart, periodEnd]
  );

  const expenses = await db.query<{ category: string; counted: boolean; amount: string; count: string }>(
    `SELECT e.category, (r.id IS NOT NULL) AS counted,
            COALESCE(SUM(e.net_deductible_amount), 0)::text AS amount, COUNT(*)::text AS count
     FROM expenses e
     LEFT JOIN receipts r ON r.expense_id = e.id
     WHERE e.user_id = $1 AND e.voided_at IS NULL AND e.occurred_at::date BETWEEN $2 AND $3
     GROUP BY e.category, (r.id IS NOT NULL)`,
    [userId, periodStart, periodEnd]
  );

  // Summed in whole pennies so the parts always add up to the total.
  const fieldPennies: Record<HmrcExpenseField, number> = { carVanTravelExpenses: 0, adminCosts: 0, professionalFees: 0, otherExpenses: 0 };
  let expenseCount = 0;
  let awaitingCount = 0;
  let awaitingPennies = 0;
  for (const row of expenses.rows) {
    if (!row.counted) {
      awaitingCount += Number(row.count);
      awaitingPennies += pennies(row.amount);
      continue;
    }
    const field = HMRC_EXPENSE_FIELD[row.category.trim().toLowerCase()] ?? DEFAULT_FIELD;
    fieldPennies[field] += pennies(row.amount);
    expenseCount += Number(row.count);
  }

  const toPounds = (p: number) => p / 100;
  return {
    tax_year: taxYear,
    period_start: periodStart,
    period_end: periodEnd,
    turnover: toPounds(pennies(income.rows[0].total)),
    expenses: {
      carVanTravelExpenses: toPounds(fieldPennies.carVanTravelExpenses),
      adminCosts: toPounds(fieldPennies.adminCosts),
      professionalFees: toPounds(fieldPennies.professionalFees),
      otherExpenses: toPounds(fieldPennies.otherExpenses)
    },
    total_expenses: toPounds(Object.values(fieldPennies).reduce((a, b) => a + b, 0)),
    income_count: Number(income.rows[0].count),
    expense_count: expenseCount,
    awaiting_receipt_count: awaitingCount,
    awaiting_receipt_amount: toPounds(awaitingPennies)
  };
}

// The request body for HMRC's "Create or Amend a Self-Employment Cumulative
// Period Summary" (Self Employment Business API 5.0). Income and expenses
// are always present, zeros included, as HMRC requires. Itemised rather
// than consolidated expenses: always allowed, and keeps the same split as
// the SA103S boxes.
export function cumulativeSummaryBody(totals: QuarterlyTotals): Record<string, unknown> {
  return {
    periodDates: { periodStartDate: totals.period_start, periodEndDate: totals.period_end },
    periodIncome: { turnover: totals.turnover, other: 0 },
    periodExpenses: { ...totals.expenses }
  };
}
