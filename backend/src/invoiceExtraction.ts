import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Mirrors the lazy-init pattern in db.ts/receiptStorage.ts/receiptExtraction.ts.
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

// Unlike receipts (photos only — see receiptExtraction.ts), invoices
// routinely arrive as PDFs. Both are supported here: an `image` content
// block for photos/screenshots, a `document` block (Anthropic's native PDF
// input, processed by the same vision-capable model — no separate
// conversion step) for PDFs.
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUPPORTED_MIME_TYPES = new Set<string>([...SUPPORTED_IMAGE_MIME_TYPES, "application/pdf"]);

const extractionResultSchema = z.object({
  source: z.string().trim().min(1).max(200).nullable(),
  total_amount: z.number().positive().nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
});

export type InvoiceExtractionResult = {
  source: string | null;
  total_amount: number | null;
  // A single date — mobile only ever fills received_date from this, never
  // period_start/period_end (most real invoices don't state an explicit
  // period, and guessing one would be dishonest).
  date: string | null;
  extraction_succeeded: boolean;
};

const EMPTY_RESULT: InvoiceExtractionResult = {
  source: null,
  total_amount: null,
  date: null,
  extraction_succeeded: false
};

// Best-effort assist only — same fallback contract as receiptExtraction.ts's
// extractReceiptFields: every failure mode (unsupported file type, API
// error, malformed response) returns EMPTY_RESULT rather than throwing, so
// manual entry always works regardless.
export async function extractInvoiceFields(buffer: Buffer, mimeType: string): Promise<InvoiceExtractionResult> {
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    return EMPTY_RESULT;
  }

  const contentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } }
      : {
          type: "image",
          source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: buffer.toString("base64") }
        };

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text:
                "This is a UK invoice or income document — a self-employed person's record of being paid for work. " +
                "UK date rule: any numeric-only date in this document is DD/MM/YYYY or DD/MM/YY — the day comes " +
                "first, then the month. For example, 03/04/2026 means 3 April 2026, never March 4. This is the " +
                "opposite of the US MM/DD convention — do not use MM/DD. " +
                "Extract who paid them (the client or company name), the total amount, and the invoice or payment " +
                "date (a single date, converted using the UK rule above — if the document states a period instead " +
                "of one date, use the later/end date of that period). " +
                "Reply with ONLY a single JSON object, no other text, in this exact shape: " +
                '{"source": string or null, "total_amount": number or null, "date": "YYYY-MM-DD" or null}. ' +
                "Use null for any field you cannot determine confidently."
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
    console.error("Invoice extraction failed:", error);
    return EMPTY_RESULT;
  }
}
