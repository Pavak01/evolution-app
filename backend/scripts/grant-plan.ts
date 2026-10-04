// Comp a tester or reset a test account's plan, without raw SQL.
//   npm run -s grant-plan -- someone@example.com pro          (no end)
//   npm run -s grant-plan -- someone@example.com basic 30     (30 days)
//   npm run -s grant-plan -- someone@example.com none         (remove plan; trial rules apply)
//   npm run -s grant-plan -- someone@example.com end-trial    (test the "trial ended" state)
//   npm run -s grant-plan -- someone@example.com restart-trial
//   npm run -s grant-plan -- someone@example.com verify         (confirm email for a tester who can't receive mail)
import "dotenv/config";
import { Pool } from "pg";

async function main(): Promise<void> {
  const [email, action, days] = process.argv.slice(2);
  if (!email || !["basic", "pro", "none", "end-trial", "restart-trial", "verify"].includes(action ?? "")) {
    console.log("Usage: grant-plan EMAIL basic|pro [DAYS] | none | end-trial | restart-trial | verify");
    process.exitCode = 1;
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c search_path=evolution,public" });
  try {
    const user = await pool.query<{ id: string }>("SELECT id FROM public.users WHERE LOWER(email) = LOWER($1)", [email]);
    if (user.rows.length === 0) throw new Error(`No account for ${email}`);
    const id = user.rows[0].id;
    if (action === "verify") {
      await pool.query("INSERT INTO email_verifications (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
      console.log(`${email}: email marked confirmed.`);
      return;
    }
    await pool.query(
      `INSERT INTO entitlements (user_id, trial_started_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
      [id]
    );
    if (action === "basic" || action === "pro") {
      await pool.query(
        `UPDATE entitlements SET plan = $2, plan_source = 'manual',
           plan_expires_at = CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() + make_interval(days => $3::int) END,
           updated_at = NOW()
         WHERE user_id = $1`,
        [id, action, days ? Number(days) : null]
      );
      console.log(`${email}: ${action === "pro" ? "Pro" : "Basic"}, ${days ? `${days} days` : "no end"}.`);
    } else if (action === "none") {
      await pool.query(`UPDATE entitlements SET plan = NULL, plan_source = NULL, plan_expires_at = NULL, updated_at = NOW() WHERE user_id = $1`, [id]);
      console.log(`${email}: plan removed (trial rules apply).`);
    } else {
      const startedAt = action === "end-trial" ? "NOW() - INTERVAL '1 month' - INTERVAL '1 day'" : "NOW()";
      await pool.query(`UPDATE entitlements SET trial_started_at = ${startedAt}, updated_at = NOW() WHERE user_id = $1`, [id]);
      console.log(`${email}: trial ${action === "end-trial" ? "ended" : "restarted (1 month from now)"}.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
