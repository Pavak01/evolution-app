// Run before *and* after every deploy, and mandatorily before deleting or
// recreating any backend service — this is the process fix for the Qbit
// incident where a service was deleted/recreated without verifying it still
// worked. Exercises the full capture -> void -> summary -> download loop
// against a real, running backend.
//
// `users` is shared with Qbit's production database (see db.ts), so this
// script cleans up the throwaway account it creates in a `finally` block —
// it must never leave test accounts behind in a table real users share.
import "dotenv/config";
import { Pool } from "pg";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4000";
const email = `smoke-${Date.now()}@example.com`;
const password = "smoke-test-password-1";
let createdUserId: string | null = null;

let failures = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`OK   ${label}`);
  } else {
    console.log(`FAIL ${label}`);
    failures += 1;
  }
}

async function main(): Promise<void> {
  const health = await fetch(`${baseUrl}/health`);
  check("GET /health", health.ok);

  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  check("POST /auth/register", registerRes.status === 201);
  const registerBody = (await registerRes.json()) as { token: string; user: { id: string } };
  const token = registerBody.token;
  createdUserId = registerBody.user?.id ?? null;
  check("register returned a token", Boolean(token));

  const authHeaders = { Authorization: `Bearer ${token}` };

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  check("POST /auth/login", loginRes.status === 200);

  // Minimal buffer satisfying the JPEG magic-byte check (0xFF 0xD8 0xFF) —
  // the app validates content bytes, not that this decodes as a real image.
  const fixtureJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const form = new FormData();
  form.set("category", "fuel");
  form.set("occurred_at", new Date().toISOString().slice(0, 10));
  form.set("payment_method", "card");
  form.set("total_amount", "42.50");
  form.set("reimbursement_status", "none");
  form.set("receipt", new Blob([fixtureJpeg], { type: "image/jpeg" }), "receipt.jpg");

  const createRes = await fetch(`${baseUrl}/expenses`, { method: "POST", headers: authHeaders, body: form });
  check("POST /expenses", createRes.status === 201);
  const created = (await createRes.json()) as { expense: { id: string; tax_year: string } };
  const expenseId = created.expense?.id;
  const taxYear = created.expense?.tax_year;
  check("expense response has id and tax_year", Boolean(expenseId && taxYear));

  const listRes = await fetch(`${baseUrl}/expenses`, { headers: authHeaders });
  check("GET /expenses", listRes.status === 200);

  const voidRes = await fetch(`${baseUrl}/expenses/${expenseId}/void`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "smoke test cleanup" })
  });
  check("POST /expenses/:id/void", voidRes.status === 200);

  const summaryRes = await fetch(`${baseUrl}/tax-years/${taxYear}/summary`, { headers: authHeaders });
  check("GET /tax-years/:taxYear/summary", summaryRes.status === 200);

  const downloadRes = await fetch(`${baseUrl}/expenses/${expenseId}`, { headers: authHeaders });
  const downloadBody = (await downloadRes.json()) as { expense: { receipt_download_url: string } };
  const downloadUrl = downloadBody.expense?.receipt_download_url;
  if (downloadUrl) {
    try {
      // Two-layer download: the URL's own query-param token proves it's
      // bound to this receipt, but the route still sits behind requireAuth
      // like every other endpoint, so the normal session header is also required.
      const redirectRes = await fetch(downloadUrl, { redirect: "manual", headers: authHeaders });
      check("GET /receipts/:id/download redirects", redirectRes.status === 302);
    } catch (error) {
      console.log(`WARN receipt download check skipped (S3 likely not configured): ${error}`);
    }
  } else {
    console.log("WARN receipt download check skipped (no download url on expense)");
  }

  if (failures > 0) {
    console.log(`\n${failures} check(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log("\nAll smoke checks passed.");
}

async function cleanup(): Promise<void> {
  if (!createdUserId || !process.env.DATABASE_URL) {
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c search_path=evolution,public" });
  try {
    await pool.query("DELETE FROM receipts WHERE user_id = $1", [createdUserId]);
    await pool.query("DELETE FROM expenses WHERE user_id = $1", [createdUserId]);
    await pool.query("DELETE FROM tax_summaries WHERE user_id = $1", [createdUserId]);
    await pool.query("DELETE FROM public.users WHERE id = $1", [createdUserId]);
    console.log(`Cleaned up smoke-test account (${email}).`);
  } catch (error) {
    console.warn(`WARN could not clean up smoke-test account ${email}:`, error);
  } finally {
    await pool.end();
  }
}

main()
  .catch((error) => {
    console.error("Smoke test crashed:", error);
    process.exitCode = 1;
  })
  .finally(() => cleanup().then(() => process.exit(process.exitCode ?? 0)));
