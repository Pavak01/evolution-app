export type PaymentMethod = "cash" | "card";
export type ReimbursementStatus = "none" | "partial" | "full";

export type Expense = {
  id: string;
  category: string;
  occurred_at: string;
  tax_year: string;
  payment_method: PaymentMethod;
  total_amount: number;
  reimbursement_status: ReimbursementStatus;
  reimbursed_amount: number;
  net_deductible_amount: number;
  business_use_percent: number;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  // Null for a travel expense saved without a receipt yet — see
  // "capture now, attach proof later" in CaptureExpenseScreen/ExpenseDetailScreen.
  receipt_download_url: string | null;
};

export type IncomeInvoice = {
  id: string;
  period_start: string;
  period_end: string;
  source: string;
  total_amount: number;
  received_date: string;
  tax_year: string;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  file_download_url: string | null;
};

// Surfaced after a successful save — informational only, never blocks or
// re-prompts. Points at the earlier expense so the user can void it from
// History if it really is a duplicate.
export type DuplicateWarning = { expense_id: string; message: string } | null;

export type ComplianceWarning = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
};

export type TaxEstimate = {
  taxable_income: number;
  estimated_income_tax: number;
  ni_class2: number;
  ni_class4: number;
  estimated_ni: number;
  total_to_set_aside: number;
};

export type TaxSummary = {
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
