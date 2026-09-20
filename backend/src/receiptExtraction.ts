import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Mirrors the lazy-init pattern in db.ts/receiptStorage.ts: ANTHROPIC_API_KEY
// is only required at the moment extraction actually runs, not at import
// time, so /health stays up even if it's momentarily unset.
let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// Kept in sync with CATEGORY_SUGGESTIONS in mobile/src/screens/expenses/CaptureExpenseScreen.tsx.
// Duplicated rather than shared across the mobile/backend boundary for one short list.
const CATEGORY_SUGGESTIONS = [
  "fuel",
  "travel",
  "parking_tolls",
  "vehicle_maintenance",
  "phone",
  "home_office",
  "clothing",
  "accountancy",
  "food",
  "other"
];

// Vision-capable image types only — PDFs/text receipts skip extraction
// entirely (see extractReceiptFields) rather than attempting a vision call
// on non-image content.
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const extractionResultSchema = z.object({
  total_amount: z.number().positive().nullable(),
  occurred_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  category: z.enum(CATEGORY_SUGGESTIONS as [string, ...string[]]).nullable(),
  merchant: z.string().trim().min(1).max(200).nullable(),
  transaction_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
});

export type ReceiptExtractionResult = {
  total_amount: number | null;
  occurred_at: string | null;
  category: string | null;
  merchant: string | null;
  // "HH:MM" printed on the receipt, when legible — used as a duplicate-
  // matching signal, never shown as a manual-entry field.
  transaction_time: string | null;
  extraction_succeeded: boolean;
};

const EMPTY_RESULT: ReceiptExtractionResult = {
  total_amount: null,
  occurred_at: null,
  category: null,
  merchant: null,
  transaction_time: null,
  extraction_succeeded: false
};

// Best-effort assist only — every failure mode here (unsupported file type,
// API error, malformed response) falls back to EMPTY_RESULT rather than
// throwing, so a bad extraction never blocks the manual-entry fallback the
// rest of the app already relies on.
export async function extractReceiptFields(buffer: Buffer, mimeType: string): Promise<ReceiptExtractionResult> {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return EMPTY_RESULT;
  }

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: buffer.toString("base64") }
            },
            {
              type: "text",
              text:
                "This is a photo of a receipt. Extract the total amount paid, the date of the transaction, " +
                `a best-guess expense category from exactly this list: ${CATEGORY_SUGGESTIONS.join(", ")}, ` +
                "the merchant/vendor name, and the transaction time if the receipt prints one. " +
                "Reply with ONLY a single JSON object, no other text, in this exact shape: " +
                '{"total_amount": number or null, "occurred_at": "YYYY-MM-DD" or null, "category": one of the list above or null, "merchant": string or null, "transaction_time": "HH:MM" (24-hour) or null}. ' +
                "Use null for any field you cannot determine confidently. Do not guess a category unless the receipt content clearly matches it."
            }
          ]
        }
      ]
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
    if (!textBlock) {
      return EMPTY_RESULT;
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return EMPTY_RESULT;
    }

    const parsed = extractionResultSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      return EMPTY_RESULT;
    }

    return { ...parsed.data, extraction_succeeded: true };
  } catch (error) {
    console.error("Receipt extraction failed:", error);
    return EMPTY_RESULT;
  }
}
