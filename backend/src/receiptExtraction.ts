import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { rotateImageBuffer } from "./receiptStorage.js";

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
    .nullable(),
  fuel_card_hint: z.string().trim().min(1).max(100).nullable(),
  // Degrees clockwise needed to make the image upright — never null, always
  // determinable. Internal only, used for the rotate-and-retry pass below,
  // never part of the public ReceiptExtractionResult.
  rotation_needed: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
});

export type ReceiptExtractionResult = {
  total_amount: number | null;
  occurred_at: string | null;
  category: string | null;
  merchant: string | null;
  // "HH:MM" printed on the receipt, when legible — used as a duplicate-
  // matching signal, never shown as a manual-entry field.
  transaction_time: string | null;
  // A short description (e.g. "Allstar fuel card") only when the receipt
  // shows clear textual evidence of a commercial/fleet fuel card — never a
  // guess. Surfaced as a non-blocking warning: that fuel was very possibly
  // paid for by the company, not the driver, so it shouldn't be claimed.
  fuel_card_hint: string | null;
  extraction_succeeded: boolean;
};

const EMPTY_RESULT: ReceiptExtractionResult = {
  total_amount: null,
  occurred_at: null,
  category: null,
  merchant: null,
  transaction_time: null,
  fuel_card_hint: null,
  extraction_succeeded: false
};

type RawExtraction = z.infer<typeof extractionResultSchema>;

async function runExtraction(buffer: Buffer, mimeType: "image/jpeg" | "image/png" | "image/webp"): Promise<RawExtraction | null> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: buffer.toString("base64") }
          },
          {
            type: "text",
            text:
              "This is a photo of a UK receipt. UK date rule: any numeric-only date on this receipt is DD/MM/YYYY " +
              "or DD/MM/YY — the day comes first, then the month. For example, 03/04/2026 on this receipt means " +
              "3 April 2026, never March 4. This is the opposite of the US MM/DD convention — do not use MM/DD. " +
              "Extract the total amount paid, the date of the transaction (converting it using the UK rule above), " +
              `a best-guess expense category from exactly this list: ${CATEGORY_SUGGESTIONS.join(", ")}, ` +
              "the merchant/vendor name, and the transaction time if the receipt prints one. " +
              "Also check specifically for signs this was paid with a commercial/fleet fuel card rather than a " +
              "personal card — named UK schemes like Allstar, UK Fuels, Keyfuels, Fuelgenie, BP Plus, Shell Fleet, " +
              "Esso Fleet, FleetCor, Radius, or WEX, or literal text like \"FUEL CARD\", \"FLEET CARD\", or " +
              "\"Card Type: FLEET\". Only report this if you see clear textual evidence of it, giving a short " +
              "description of what you saw (e.g. \"Allstar fuel card\"); otherwise use null — do not guess. " +
              "Also determine whether this image is rotated and needs turning to be upright and readable — " +
              "respond with rotation_needed as 0 (already upright), 90, 180, or 270: the degrees to rotate the " +
              "image CLOCKWISE to make it upright. " +
              "Reply with ONLY a single JSON object, no other text, in this exact shape: " +
              '{"total_amount": number or null, "occurred_at": "YYYY-MM-DD" or null, "category": one of the list above or null, "merchant": string or null, "transaction_time": "HH:MM" (24-hour) or null, "fuel_card_hint": string or null, "rotation_needed": 0, 90, 180, or 270}. ' +
              "Use null for any field you cannot determine confidently. Do not guess a category unless the receipt content clearly matches it."
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

function toPublicResult(data: RawExtraction): ReceiptExtractionResult {
  const { rotation_needed: _rotationNeeded, ...rest } = data;
  return { ...rest, extraction_succeeded: true };
}

// Best-effort assist only — every failure mode here (unsupported file type,
// API error, malformed response) falls back to EMPTY_RESULT rather than
// throwing, so a bad extraction never blocks the manual-entry fallback the
// rest of the app already relies on.
export async function extractReceiptFields(buffer: Buffer, mimeType: string): Promise<ReceiptExtractionResult> {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return EMPTY_RESULT;
  }
  const typedMimeType = mimeType as "image/jpeg" | "image/png" | "image/webp";

  try {
    const first = await runExtraction(buffer, typedMimeType);
    if (!first) {
      return EMPTY_RESULT;
    }
    if (first.rotation_needed === 0) {
      return toPublicResult(first);
    }

    // Genuinely rotated (independent of EXIF, already normalized upstream)
    // — vision models read inverted/sideways text measurably worse, so
    // rotate to what the model itself says is upright and read it again.
    // Only costs this extra call for the actual bad case.
    try {
      const rotatedBuffer = await rotateImageBuffer(buffer, first.rotation_needed);
      const second = await runExtraction(rotatedBuffer, typedMimeType);
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
    console.error("Receipt extraction failed:", error);
    return EMPTY_RESULT;
  }
}
