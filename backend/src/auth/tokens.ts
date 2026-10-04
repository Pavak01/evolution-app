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

const twoFactorChallengeTtlMinutes = 10;

// Evolution's own short-lived artifact — minted and verified here with
// Evolution's JWT_SECRET, unlike the TOTP secret itself (which must match
// Qbit's encryption exactly since it decrypts data Qbit created).
export function signTwoFactorChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "two-factor-login" }, getJwtSecret(), {
    expiresIn: `${twoFactorChallengeTtlMinutes}m`
  });
}

// Carries a just-registered (or not-yet-confirmed) account from the
// password step to the emailed-code step — no session exists until the
// code is entered, so an unconfirmed account can't use the app at all.
export function signEmailVerificationToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "email-verification" }, getJwtSecret(), { expiresIn: "30m" });
}

// Returns the user id from a purpose-bound challenge token, or null.
export function readPurposeToken(token: string, purpose: string): string | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded !== "object" || decoded === null) return null;
    const payload = decoded as jwt.JwtPayload;
    return payload.purpose === purpose && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
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
