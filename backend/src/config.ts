export const isProduction = process.env.NODE_ENV === "production";

const configuredOrigins = String(process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const allowedOrigins = new Set([
  ...configuredOrigins,
  "http://localhost:19006",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:4000"
]);

export const port = Number(process.env.PORT || 4000);

export const maxReceiptSizeBytes = 8 * 1024 * 1024;
export const receiptDownloadTtlSeconds = 15 * 60;

export const allowedReceiptMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv"
]);
