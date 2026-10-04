// Create, list and disable free-access codes (testers, promotions).
//   npm run -s promo-code -- create --tier pro [--days 90] [--max 20] [--expires 2027-01-31] [--note "closed test"] [--code SUMMER26]
//   npm run -s promo-code -- list
//   npm run -s promo-code -- disable EVO-7K3M-Q9TD
// Codes are given away, never sold — selling access outside Play billing
// would break Google Play's payments policy.
import "dotenv/config";
import { randomInt } from "node:crypto";
import { Pool } from "pg";

// No look-alikes: 0/O, 1/I/L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const generate = () => `EVO-${block()}-${block()}`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c search_path=evolution,public" });
  try {
    if (command === "create") {
      const tier = flag(args, "tier");
      if (tier !== "basic" && tier !== "pro") throw new Error("--tier must be basic or pro");
      const days = flag(args, "days");
      const max = flag(args, "max");
      const expires = flag(args, "expires");
      if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new Error("--expires must be YYYY-MM-DD");
      const code = (flag(args, "code") ?? generate()).replace(/\s+/g, "").toUpperCase();
      await pool.query(
        `INSERT INTO promo_codes (code, tier, duration_days, max_redemptions, expires_at, note)
         VALUES ($1, $2, $3, $4, $5::date + INTERVAL '1 day', $6)`, // a code works through the whole of its expiry date
        [code, tier, days ? Number(days) : null, max ? Number(max) : null, expires ?? null, flag(args, "note") ?? null]
      );
      console.log(`Created ${code}: ${tier === "pro" ? "Pro" : "Basic"}, ${days ? `${days} days` : "no end"}, ${max ? `up to ${max} people` : "unlimited people"}${expires ? `, usable until ${expires}` : ""}.`);
    } else if (command === "list") {
      const { rows } = await pool.query(
        `SELECT code, tier, duration_days, max_redemptions, redeemed_count,
                to_char(expires_at - INTERVAL '1 day', 'YYYY-MM-DD') AS usable_until,
                disabled_at IS NOT NULL AS disabled, note
         FROM promo_codes ORDER BY created_at DESC`
      );
      if (rows.length === 0) console.log("No codes yet.");
      for (const r of rows) {
        console.log(
          `${r.code}  ${r.tier === "pro" ? "Pro" : "Basic"}  ${r.duration_days ? `${r.duration_days} days` : "no end"}  ` +
            `used ${r.redeemed_count}${r.max_redemptions ? `/${r.max_redemptions}` : ""}` +
            `${r.usable_until ? `  until ${r.usable_until}` : ""}${r.disabled ? "  DISABLED" : ""}${r.note ? `  (${r.note})` : ""}`
        );
      }
    } else if (command === "disable") {
      const code = (args[0] ?? "").replace(/\s+/g, "").toUpperCase();
      const { rowCount } = await pool.query("UPDATE promo_codes SET disabled_at = NOW() WHERE code = $1 AND disabled_at IS NULL", [code]);
      console.log(rowCount ? `Disabled ${code}. Anyone who already used it keeps what it gave them.` : `No active code ${code}.`);
    } else {
      console.log("Usage: promo-code create --tier basic|pro [--days N] [--max N] [--expires YYYY-MM-DD] [--note TEXT] [--code CODE] | list | disable CODE");
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
