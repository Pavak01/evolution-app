import { postMultipart } from "./client";

export type ReceiptExtraction = {
  total_amount: number | null;
  occurred_at: string | null;
  category: string | null;
  merchant: string | null;
  extraction_succeeded: boolean;
};

export async function extractReceiptFields(uri: string, name: string, type: string): Promise<ReceiptExtraction> {
  return postMultipart("/expenses/extract-receipt", {}, { uri, name, type, fieldName: "receipt" });
}
