import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import sharp from "sharp";

let cachedBucket: string | null = null;
let cachedClient: S3Client | null = null;

// Lazily validates and creates the S3 client (and resolves the bucket name),
// deferring the check until the first S3 operation is actually performed.
// This mirrors db.ts, ensuring the module can be safely imported before
// Railway has finished injecting environment variables into the process.
function getBucketName(): string {
  if (cachedBucket) {
    return cachedBucket;
  }

  const bucket = process.env.AWS_S3_BUCKET_NAME ?? "";
  const endpoint = process.env.AWS_ENDPOINT_URL ?? "";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are required"
    );
  }

  cachedBucket = bucket;
  return cachedBucket;
}

function getS3Client(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }

  const bucket = process.env.AWS_S3_BUCKET_NAME ?? "";
  const region = process.env.AWS_DEFAULT_REGION ?? "auto";
  const endpoint = process.env.AWS_ENDPOINT_URL ?? "";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";
  const forcePathStyle = String(process.env.RECEIPTS_S3_FORCE_PATH_STYLE ?? "").trim().toLowerCase() === "true";

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are required"
    );
  }

  cachedClient = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey }
  });
  return cachedClient;
}

// `s3` behaves like an eagerly-constructed S3Client for all existing call
// sites, but defers actual validation/construction until the first real
// property access, i.e. the first S3 operation.
const s3: S3Client = new Proxy({} as S3Client, {
  get(_target, prop, receiver) {
    const actualClient = getS3Client();
    const value = Reflect.get(actualClient, prop, actualClient);
    return typeof value === "function" ? value.bind(actualClient) : value;
  }
});

// Used for both receipt photos and income-invoice files — same storage
// shape (an owned, private object keyed by user id), just a different key
// prefix chosen by the caller.
export async function uploadReceiptObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}

export async function deleteReceiptObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
}

export async function deleteReceiptObjects(keys: string[]): Promise<void> {
  const uniqueKeys = Array.from(new Set(keys.map((key) => key.trim()).filter(Boolean)));

  await Promise.all(
    uniqueKeys.map(async (key) => {
      try {
        await deleteReceiptObject(key);
      } catch (error) {
        console.warn(`Failed to delete receipt object ${key}:`, error);
      }
    })
  );
}

export async function getReceiptPresignedUrl(key: string, downloadFilename: string): Promise<string> {
  const safeFilename = downloadFilename.replace(/[\r\n"]/g, "");
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}

const knownFileSignatures: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]
};

const dangerousSignatures: number[][] = [
  [0x4d, 0x5a], // Windows PE executable ("MZ")
  [0x7f, 0x45, 0x4c, 0x46], // Linux ELF executable
  [0x23, 0x21] // shebang script ("#!")
];

function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  return signature.length <= buffer.length && signature.every((byte, index) => buffer[index] === byte);
}

function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

// Used to detect the same receipt image attached to more than one expense —
// one receipt can only be proof for one actual transaction.
export function computeReceiptContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function receiptContentMatchesDeclaredType(buffer: Buffer, declaredMimeType: string): boolean {
  if (dangerousSignatures.some((signature) => matchesSignature(buffer, signature))) {
    return false;
  }

  if (declaredMimeType === "image/webp") {
    return isWebp(buffer);
  }

  if (declaredMimeType === "text/plain" || declaredMimeType === "text/csv") {
    return !buffer.subarray(0, Math.min(buffer.length, 8000)).includes(0);
  }

  const signatures = knownFileSignatures[declaredMimeType];
  if (!signatures) {
    return false;
  }

  return signatures.some((signature) => matchesSignature(buffer, signature));
}

const ROTATABLE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Phone cameras (Android especially) very often store a JPEG's pixels in
// one orientation plus an EXIF "rotate on display" flag — the OS photo
// viewer honours that flag so the photo looks correctly oriented to the
// user, but a pipeline that reads raw pixel bytes without applying EXIF
// (very plausibly including a vision API) sees the un-rotated image. This
// bakes the flag into the actual pixels and strips it, so every consumer
// of this buffer (S3 storage, the duplicate-detection content hash, OCR)
// sees the same, correctly-oriented image regardless of source encoding.
// Non-raster types pass through unchanged. Best-effort: falls back to the
// original buffer on any processing error rather than failing the upload.
export async function normalizeImageOrientation(buffer: Buffer, mimeType: string): Promise<Buffer> {
  if (!ROTATABLE_MIME_TYPES.has(mimeType)) {
    return buffer;
  }

  try {
    return await sharp(buffer).rotate().toBuffer();
  } catch (error) {
    console.error("Image orientation normalization failed, using original buffer:", error);
    return buffer;
  }
}

// Explicit rotation on top of an already EXIF-normalized buffer — used by
// receiptExtraction.ts/invoiceExtraction.ts's rotate-and-retry pass, for
// content that's genuinely upside-down/sideways independent of any EXIF
// flag (the photographed receipt itself was rotated).
export async function rotateImageBuffer(buffer: Buffer, degrees: 90 | 180 | 270): Promise<Buffer> {
  return sharp(buffer).rotate(degrees).toBuffer();
}
