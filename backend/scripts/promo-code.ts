// Create, list and disable free-access codes from a Mac terminal. The
// friendlier way is the "Create promo code" file in the evolution-app
// folder (double-click), or Settings → Admin in the app.
//   npm run -s promo-code -- create --tier pro [--days 90] [--max 20] [--expires 2027-01-31] [--note "closed test"] [--code SUMMER26]
//   npm run -s promo-code -- list
//   npm run -s promo-code -- disable EVO-7K3M-Q9TD
import "dotenv/config";
import { db } from "../src/db.js";
import { createPromoCode, describePromoCode, disablePromoCode, listPromoCodes } from "../src/promoCodes.js";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "create") {
    const tier = flag(args, "tier");
    if (tier !== "basic" && tier !== "pro") throw new Error("--tier must be basic or pro");
    const days = flag(args, "days");
    const max = flag(args, "max");
    const row = await createPromoCode({
      tier,
      days: days ? Number(days) : null,
      max: max ? Number(max) : null,
      usableUntil: flag(args, "expires") ?? null,
      note: flag(args, "note") ?? null,
      code: flag(args, "code") ?? null
    });
    console.log(`Created ${row.code}: ${describePromoCode(row)}.`);
    console.log(`CODE=${row.code}`); // machine-readable line for the Mac helper
  } else if (command === "list") {
    const rows = await listPromoCodes();
    if (rows.length === 0) console.log("No codes yet.");
    for (const r of rows) console.log(`${r.code}  ${describePromoCode(r)}${r.note ? `  (${r.note})` : ""}`);
  } else if (command === "disable") {
    const done = await disablePromoCode(args[0] ?? "");
    console.log(done ? `Disabled ${args[0]}. Anyone who already used it keeps what it gave them.` : `No active code ${args[0]}.`);
  } else {
    console.log("Usage: promo-code create --tier basic|pro [--days N] [--max N] [--expires YYYY-MM-DD] [--note TEXT] [--code CODE] | list | disable CODE");
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
