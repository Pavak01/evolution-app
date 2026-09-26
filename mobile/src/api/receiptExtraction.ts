import { postMultipart } from "./client";

export type ReceiptExtraction = {
  total_amount: number | null;
  occurred_at: string | null;
  category: string | null;
  merchant: string | null;
  // "HH:MM" printed on the receipt, when legible — used as a duplicate-
  // matching signal, never shown as a manual-entry field.
  transaction_time: string | null;
  // A short description (e.g. "Allstar fuel card") only when the receipt
  // shows clear signs of a commercial/fleet fuel card — surfaced as a
  // non-blocking warning, never auto-excluded.
  fuel_card_hint: string | null;
  extraction_succeeded: boolean;
};

export async function extractReceiptFields(uri: string, name: string, type: string): Promise<ReceiptExtraction> {
  return postMultipart("/expenses/extract-receipt", {}, { uri, name, type, fieldName: "receipt" });
}
