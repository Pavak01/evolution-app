import crypto from "node:crypto";

// TOTP 2FA on the shared `users` table's two_factor_* columns. The crypto
// was ported verbatim from Qbit (byte-for-byte compatible with secrets Qbit
// encrypted); since 2026-10-05 Evolution also *creates* secrets (setup/
// enable/disable in routes/twoFactor.routes.ts) using the exact inverse
// below — format "iv.tag.ciphertext", base64url, AES-256-GCM.
const twoFactorTimeStepSeconds = 30;

function getTwoFactorEncryptionKey(): Buffer {
  const seed = process.env.TWO_FACTOR_ENCRYPTION_KEY?.trim();
  if (!seed) {
    throw new Error("TWO_FACTOR_ENCRYPTION_KEY is required");
  }
  return crypto.createHash("sha256").update(seed).digest();
}

export function encryptTwoFactorSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getTwoFactorEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let current = 0;
  let output = "";
  for (const byte of buffer) {
    current = (current << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(current >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(current << (5 - bits)) & 31];
  return output;
}

// 160-bit secret, the RFC 4226 recommended size; base32 is what
// authenticator apps expect.
export function generateTwoFactorSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`Evolution:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Evolution&algorithm=SHA1&digits=6&period=30`;
}

export function decryptTwoFactorSecret(payload: string | null | undefined): string | null {
  if (!payload) {
    return null;
  }

  const [ivPart, tagPart, encryptedPart] = payload.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", getTwoFactorEncryptionKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let current = 0;
  const output: number[] = [];

  for (const char of value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "")) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      continue;
    }

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

export function generateTotpCode(secret: string, timestampMs = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / twoFactorTimeStepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;

  return code.toString().padStart(6, "0");
}

// Accepts a 30s window on either side of "now" to tolerate clock drift
// between the device and the authenticator app, matching Qbit's tolerance.
export function verifyTotpCode(secret: string, code: string): boolean {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  for (let offset = -1; offset <= 1; offset += 1) {
    const timestamp = Date.now() + offset * twoFactorTimeStepSeconds * 1000;
    if (generateTotpCode(secret, timestamp) === normalized) {
      return true;
    }
  }

  return false;
}
