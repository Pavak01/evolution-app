import { apiJson } from "./client";
import type { IncomeInvoice, TaxSummary } from "./types";

export type CreateIncomeInvoiceInput = {
  period_start: string;
  period_end: string;
  source: string;
  total_amount: number;
  received_date: string;
  notes?: string;
  fileUri?: string;
  fileName?: string;
  fileType?: string;
};

export async function createIncomeInvoice(
  input: CreateIncomeInvoiceInput
): Promise<{ invoice: IncomeInvoice; summary: TaxSummary }> {
  const form = new FormData();
  form.append("period_start", input.period_start);
  form.append("period_end", input.period_end);
  form.append("source", input.source);
  form.append("total_amount", String(input.total_amount));
  form.append("received_date", input.received_date);
  if (input.notes) {
    form.append("notes", input.notes);
  }
  if (input.fileUri) {
    form.append("invoice_file", {
      uri: input.fileUri,
      name: input.fileName ?? "invoice",
      type: input.fileType ?? "application/octet-stream"
    } as unknown as Blob);
  }

  return apiJson("/income-invoices", { method: "POST", body: form });
}

export async function listIncomeInvoices(params?: { tax_year?: string }): Promise<IncomeInvoice[]> {
  const query = params?.tax_year ? `?tax_year=${encodeURIComponent(params.tax_year)}` : "";
  const result = await apiJson<{ invoices: IncomeInvoice[] }>(`/income-invoices${query}`);
  return result.invoices;
}

export async function voidIncomeInvoice(id: string, reason: string): Promise<TaxSummary> {
  const result = await apiJson<{ voided: true; summary: TaxSummary }>(`/income-invoices/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return result.summary;
}
