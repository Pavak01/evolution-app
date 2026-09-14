import crypto from "node:crypto";

// Verifies against the same encrypted TOTP secret Qbit already manages in
// the shared `users` table — not a parallel 2FA system. Ported verbatim
// from Qbit's backend/src/index.ts (encryptTwoFactorSecret/base32Encode/
// generateTwoFactorSecret omitted since Evolution never creates a 2FA
// secret, only verifies one Qbit already set up) so the crypto is
// byte-for-byte compatible with what Qbit already encrypted.
const twoFactorTimeStepSeconds = 30;

function getTwoFactorEncryptionKey(): Buffer {
  const seed = process.env.TWO_FACTOR_ENCRYPTION_KEY?.trim();
  if (!seed) {
    throw new Error("TWO_FACTOR_ENCRYPTION_KEY is required");
  }
  return crypto.createHash("sha256").update(seed).digest();
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

function generateTotpCode(secret: string, timestampMs = Date.now()): string {
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
