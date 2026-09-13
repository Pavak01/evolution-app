import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import multer from "multer";
import { isProduction, maxReceiptSizeBytes } from "../config.js";

function formatErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sendError(res: Response, statusCode: number, publicMessage: string, error?: unknown): Response {
  if (error) {
    console.error(publicMessage, error);
  }

  if (isProduction || error === undefined) {
    return res.status(statusCode).json({ error: publicMessage });
  }

  return res.status(statusCode).json({ error: publicMessage, details: formatErrorDetails(error) });
}

export function finalErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): Response {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: `File is too large. Max size is ${Math.round(maxReceiptSizeBytes / (1024 * 1024))}MB.` });
    }

    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  if (err instanceof Error && err.message === "Unsupported receipt file type") {
    return res.status(400).json({
      error: "Unsupported file type. Allowed types: PDF, JPEG, PNG, WEBP, plain text."
    });
  }

  const requestId = crypto.randomUUID();
  console.error(`Unhandled error ${requestId}`, err);
  return res.status(500).json({ error: "Internal server error", request_id: requestId });
}
