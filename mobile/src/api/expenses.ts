import { apiJson, postMultipart } from "./client";
import type { DuplicateWarning, Expense, PaymentMethod, ReimbursementStatus, TaxSummary } from "./types";

export type CreateExpenseInput = {
  category: string;
  occurred_at: string;
  payment_method: PaymentMethod;
  total_amount: number;
  reimbursement_status: ReimbursementStatus;
  reimbursed_amount?: number;
  business_use_percent?: number;
  notes?: string;
  // Optional only for `travel` — the backend rejects a missing receipt for
  // every other category. See CaptureExpenseScreen.tsx's validate().
  receiptUri?: string;
  receiptName?: string;
  receiptType?: string;
  // Sent unchanged on every retry of the same submission (direct attempt,
  // then any offline-queue retries) so a lost response never creates a
  // second expense — see offlineQueue.ts.
  idempotencyKey?: string;
  // OCR-only enrichment used for duplicate matching — never a manual-entry field.
  transactionTime?: string;
};

export async function createExpense(
  input: CreateExpenseInput
): Promise<{ expense: Expense; summary: TaxSummary; duplicate_warning: DuplicateWarning }> {
  const fields: Record<string, string> = {
    category: input.category,
    occurred_at: input.occurred_at,
    payment_method: input.payment_method,
    total_amount: String(input.total_amount),
    reimbursement_status: input.reimbursement_status
  };
  if (input.reimbursed_amount !== undefined) {
    fields.reimbursed_amount = String(input.reimbursed_amount);
  }
  if (input.business_use_percent !== undefined) {
    fields.business_use_percent = String(input.business_use_percent);
  }
  if (input.notes) {
    fields.notes = input.notes;
  }
  if (input.idempotencyKey) {
    fields.idempotency_key = input.idempotencyKey;
  }
  if (input.transactionTime) {
    fields.transaction_time = input.transactionTime;
  }

  const file = input.receiptUri
    ? { uri: input.receiptUri, name: input.receiptName ?? "receipt", type: input.receiptType ?? "application/octet-stream", fieldName: "receipt" }
    : undefined;

  return postMultipart("/expenses", fields, file);
}

// Completes a travel expense that was saved without a receipt at capture time.
export async function attachReceipt(
  expenseId: string,
  uri: string,
  name: string,
  type: string
): Promise<{ expense: Expense; summary: TaxSummary; duplicate_warning: DuplicateWarning }> {
  return postMultipart(`/expenses/${expenseId}/receipt`, {}, { uri, name, type, fieldName: "receipt" });
}

export async function listExpenses(params?: { tax_year?: string }): Promise<Expense[]> {
  const query = params?.tax_year ? `?tax_year=${encodeURIComponent(params.tax_year)}` : "";
  const result = await apiJson<{ expenses: Expense[] }>(`/expenses${query}`);
  return result.expenses;
}

export async function getExpense(id: string): Promise<Expense> {
  const result = await apiJson<{ expense: Expense }>(`/expenses/${id}`);
  return result.expense;
}

export async function voidExpense(id: string, reason: string): Promise<TaxSummary> {
  const result = await apiJson<{ voided: true; summary: TaxSummary }>(`/expenses/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return result.summary;
}
