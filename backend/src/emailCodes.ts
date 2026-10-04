import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { getJwtSecret } from "./auth/tokens.js";
import { db } from "./db.js";
import { sendEmail } from "./email.js";

export type CodePurpose = "verify" | "reset";

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;

// ~120k known throwaway domains (mailinator & co) — the usual source of
// repeat free trials. Loaded once; a Set makes each check O(1).
const disposableDomains = new Set<string>(createRequire(import.meta.url)("disposable-email-domains") as string[]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return disposableDomains.has(domain);
}

// Keyed with the server secret, so a leaked table of hashes can't be
// brute-forced offline across the small 6-digit space.
function hashCode(code: string): string {
  return createHmac("sha256", getJwtSecret()).update(`email-code:${code}`).digest("hex");
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  const result = await db.query("SELECT 1 FROM email_verifications WHERE user_id = $1", [userId]);
  return result.rows.length > 0;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await db.query("INSERT INTO email_verifications (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
}

export type SendResult = { sent: true } | { sent: false; reason: string; retryAfterSeconds?: number };

// Issues a new code (superseding any earlier one for this purpose) and
// emails it — unless a send is too soon / too frequent.
export async function sendCode(userId: string, email: string, purpose: CodePurpose): Promise<SendResult> {
  const recent = await db.query<{ seconds_since_last: number | null; sends_last_hour: number }>(
    `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS seconds_since_last,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS sends_last_hour
     FROM email_codes WHERE user_id = $1 AND purpose = $2`,
    [userId, purpose]
  );
  const { seconds_since_last: since, sends_last_hour: lastHour } = recent.rows[0];
  if (since !== null && since < RESEND_COOLDOWN_SECONDS) {
    const wait = RESEND_COOLDOWN_SECONDS - since;
    return { sent: false, reason: `Wait ${wait} seconds before asking for another code.`, retryAfterSeconds: wait };
  }
  if (lastHour >= MAX_SENDS_PER_HOUR) {
    return { sent: false, reason: "Too many codes requested. Try again in an hour." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.query(
    `INSERT INTO email_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))`,
    [userId, purpose, hashCode(code), CODE_TTL_MINUTES]
  );
  const what = purpose === "verify" ? "confirm your email" : "reset your password";
  await sendEmail({
    to: email,
    subject: `Your Evolution code: ${code}`,
    text: `Your Evolution code is ${code}.\n\nUse it to ${what}. It expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
    html:
      `<p>Your Evolution code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:8px 0">${code}</p>` +
      `<p>Use it to ${what}. It expires in ${CODE_TTL_MINUTES} minutes.</p>` +
      `<p style="color:#7b624d">If you didn't ask for this, you can ignore this email.</p>`
  });
  return { sent: true };
}

export type CheckResult = { ok: true } | { ok: false; error: string };

// Checks the newest live code for this purpose. A wrong guess counts
// against it; the 5th wrong guess (or expiry) means a new code is needed.
export async function checkCode(userId: string, purpose: CodePurpose, code: string): Promise<CheckResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: string; code_hash: string; attempts: number; expired: boolean }>(
      `SELECT id, code_hash, attempts, expires_at <= NOW() AS expired
       FROM email_codes WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [userId, purpose]
    );
    const row = found.rows[0];
    const needNew = "That code has expired or been used up. Ask for a new one.";
    if (!row || row.expired || row.attempts >= MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      return { ok: false, error: needNew };
    }
    const given = Buffer.from(hashCode(code.replace(/\s+/g, "")));
    const stored = Buffer.from(row.code_hash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      await client.query("UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
      await client.query("COMMIT");
      const left = MAX_ATTEMPTS - row.attempts - 1;
      return { ok: false, error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : needNew };
    }
    await client.query("UPDATE email_codes SET consumed_at = NOW() WHERE id = $1", [row.id]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
