import { postMultipart } from "./client";

export type InvoiceExtraction = {
  source: string | null;
  total_amount: number | null;
  date: string | null;
  extraction_succeeded: boolean;
};

export async function extractInvoiceFields(uri: string, name: string, type: string): Promise<InvoiceExtraction> {
  return postMultipart("/income-invoices/extract", {}, { uri, name, type, fieldName: "invoice_file" });
}
