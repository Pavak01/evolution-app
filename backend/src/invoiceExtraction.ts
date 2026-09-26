import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { rotateImageBuffer } from "./receiptStorage.js";

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
    .nullable(),
  // Degrees clockwise needed to make a photographed image upright — always
  // 0 for a PDF. Internal only, used for the rotate-and-retry pass
  // below, never part of the public InvoiceExtractionResult.
  rotation_needed: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
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

type RawExtraction = z.infer<typeof extractionResultSchema>;

function buildContentBlock(buffer: Buffer, mimeType: string): Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam {
  return mimeType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } }
    : {
        type: "image",
        source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: buffer.toString("base64") }
      };
}

async function runExtraction(buffer: Buffer, mimeType: string): Promise<RawExtraction | null> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          buildContentBlock(buffer, mimeType),
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
              "If this is a photographed image that's rotated, also determine the clockwise rotation needed to " +
              "make it upright and readable — respond with rotation_needed as 0 (already upright), 90, 180, or " +
              "270; for a PDF or non-photographed content, use 0. " +
              "Reply with ONLY a single JSON object, no other text, in this exact shape: " +
              '{"source": string or null, "total_amount": number or null, "date": "YYYY-MM-DD" or null, "rotation_needed": 0, 90, 180, or 270}. ' +
              "Use null for any field you cannot determine confidently."
          }
        ]
      }
    ]
  });

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  if (!textBlock) {
    return null;
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  const parsed = extractionResultSchema.safeParse(JSON.parse(jsonMatch[0]));
  return parsed.success ? parsed.data : null;
}

function toPublicResult(data: RawExtraction): InvoiceExtractionResult {
  const { rotation_needed: _rotationNeeded, ...rest } = data;
  return { ...rest, extraction_succeeded: true };
}

// Rotation-correction only makes sense for a photographed image — a PDF
// page's rotation is a different, unrelated concept, out of scope here.
const ROTATABLE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Best-effort assist only — same fallback contract as receiptExtraction.ts's
// extractReceiptFields: every failure mode (unsupported file type, API
// error, malformed response) returns EMPTY_RESULT rather than throwing, so
// manual entry always works regardless.
export async function extractInvoiceFields(buffer: Buffer, mimeType: string): Promise<InvoiceExtractionResult> {
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    return EMPTY_RESULT;
  }

  try {
    const first = await runExtraction(buffer, mimeType);
    if (!first) {
      return EMPTY_RESULT;
    }
    if (first.rotation_needed === 0 || !ROTATABLE_MIME_TYPES.has(mimeType)) {
      return toPublicResult(first);
    }

    // Genuinely rotated (independent of EXIF, already normalized upstream)
    // — vision models read inverted/sideways text measurably worse, so
    // rotate to what the model itself says is upright and read it again.
    // Only costs this extra call for the actual bad case.
    try {
      const rotatedBuffer = await rotateImageBuffer(buffer, first.rotation_needed);
      const second = await runExtraction(rotatedBuffer, mimeType);
      if (second) {
        return toPublicResult(second);
      }
    } catch (rotateError) {
      console.error("Rotation retry failed, using first-pass result:", rotateError);
    }

    // Retry failed or didn't parse — the first pass is still a real result,
    // even if read at an angle, so use it rather than giving up entirely.
    return toPublicResult(first);
  } catch (error) {
    console.error("Invoice extraction failed:", error);
    return EMPTY_RESULT;
  }
}
