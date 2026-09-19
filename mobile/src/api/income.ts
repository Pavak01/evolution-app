import { apiJson, postMultipart } from "./client";
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
  // Sent unchanged on every retry of the same submission (direct attempt,
  // then any offline-queue retries) so a lost response never creates a
  // second income record — see offlineQueue.ts.
  idempotencyKey?: string;
};

export async function createIncomeInvoice(
  input: CreateIncomeInvoiceInput
): Promise<{ invoice: IncomeInvoice; summary: TaxSummary }> {
  const fields: Record<string, string> = {
    period_start: input.period_start,
    period_end: input.period_end,
    source: input.source,
    total_amount: String(input.total_amount),
    received_date: input.received_date
  };
  if (input.notes) {
    fields.notes = input.notes;
  }
  if (input.idempotencyKey) {
    fields.idempotency_key = input.idempotencyKey;
  }

  const file = input.fileUri
    ? {
        uri: input.fileUri,
        name: input.fileName ?? "invoice",
        type: input.fileType ?? "application/octet-stream",
        fieldName: "invoice_file"
      }
    : undefined;

  return postMultipart("/income-invoices", fields, file);
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
