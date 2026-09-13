import { apiJson } from "./client";
import type { Expense, PaymentMethod, ReimbursementStatus, TaxSummary } from "./types";

export type CreateExpenseInput = {
  category: string;
  occurred_at: string;
  payment_method: PaymentMethod;
  total_amount: number;
  reimbursement_status: ReimbursementStatus;
  reimbursed_amount?: number;
  notes?: string;
  receiptUri: string;
  receiptName: string;
  receiptType: string;
};

export async function createExpense(input: CreateExpenseInput): Promise<{ expense: Expense; summary: TaxSummary }> {
  const form = new FormData();
  form.append("category", input.category);
  form.append("occurred_at", input.occurred_at);
  form.append("payment_method", input.payment_method);
  form.append("total_amount", String(input.total_amount));
  form.append("reimbursement_status", input.reimbursement_status);
  if (input.reimbursed_amount !== undefined) {
    form.append("reimbursed_amount", String(input.reimbursed_amount));
  }
  if (input.notes) {
    form.append("notes", input.notes);
  }
  // React Native's FormData accepts this {uri,name,type} shape for file parts.
  form.append("receipt", { uri: input.receiptUri, name: input.receiptName, type: input.receiptType } as unknown as Blob);

  return apiJson("/expenses", { method: "POST", body: form });
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
