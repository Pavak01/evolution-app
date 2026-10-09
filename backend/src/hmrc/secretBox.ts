import crypto from "node:crypto";

// AES-256-GCM for HMRC OAuth tokens and the user's National Insurance
// number, with its own key (HMRC_TOKEN_ENCRYPTION_KEY) so a leak of the 2FA
// key can't unlock them. Same "iv.tag.ciphertext" base64url format as the
// 2FA secrets (auth/twoFactor.ts).
function key(): Buffer {
  const seed = process.env.HMRC_TOKEN_ENCRYPTION_KEY?.trim();
  if (!seed) throw new Error("HMRC_TOKEN_ENCRYPTION_KEY is required");
  return crypto.createHash("sha256").update(seed).digest();
}

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function open(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
