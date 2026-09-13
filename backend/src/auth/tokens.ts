import jwt from "jsonwebtoken";
import type { Request } from "express";
import { receiptDownloadTtlSeconds } from "../config.js";

let cachedJwtSecret: string | null = null;

// Lazily validates and resolves JWT_SECRET, deferring the check until the
// first JWT operation is actually performed. This ensures the module can be
// safely imported, and the server can start listening and answer /health,
// before Railway has finished injecting environment variables.
export function getJwtSecret(): string {
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  const secret = process.env.JWT_SECRET ?? "";
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  cachedJwtSecret = secret;
  return cachedJwtSecret;
}

export function signToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, ver: tokenVersion }, getJwtSecret(), { expiresIn: "7d" });
}

export function signReceiptDownloadToken(userId: string, receiptId: string): string {
  return jwt.sign({ sub: userId, rid: receiptId, purpose: "receipt-download" }, getJwtSecret(), {
    expiresIn: receiptDownloadTtlSeconds
  });
}

export function getReceiptDownloadUrl(req: Request, userId: string, receiptId: string): string {
  const token = signReceiptDownloadToken(userId, receiptId);
  return `${req.protocol}://${req.get("host")}/receipts/${receiptId}/download?token=${encodeURIComponent(token)}`;
}

export function signInvoiceDownloadToken(userId: string, invoiceId: string): string {
  return jwt.sign({ sub: userId, iid: invoiceId, purpose: "invoice-download" }, getJwtSecret(), {
    expiresIn: receiptDownloadTtlSeconds
  });
}

export function getInvoiceDownloadUrl(req: Request, userId: string, invoiceId: string): string {
  const token = signInvoiceDownloadToken(userId, invoiceId);
  return `${req.protocol}://${req.get("host")}/income-invoices/${invoiceId}/download?token=${encodeURIComponent(token)}`;
}
