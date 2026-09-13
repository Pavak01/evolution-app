// Run right after provisioning any new Railway (or other) service, before it
// takes traffic — reports env-var readiness without crashing the process.
// This is the direct fix for the Qbit incident where a recreated service's
// env vars were assumed (wrongly) to carry over automatically.
import "dotenv/config";
import { Pool } from "pg";

const required = ["DATABASE_URL", "JWT_SECRET"] as const;
const s3Vars = ["AWS_S3_BUCKET_NAME", "AWS_ENDPOINT_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"] as const;

let ok = true;

for (const name of required) {
  const present = Boolean(process.env[name]);
  console.log(`${present ? "OK  " : "MISS"} ${name}`);
  if (!present) ok = false;
}

for (const name of s3Vars) {
  const present = Boolean(process.env[name]);
  console.log(`${present ? "OK  " : "MISS"} ${name}`);
  if (!present) ok = false;
}

if (process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("SELECT 1");
    console.log("OK   database connection");
  } catch (error) {
    console.log("FAIL database connection:", error instanceof Error ? error.message : error);
    ok = false;
  } finally {
    await pool.end();
  }
}

console.log(ok ? "\nAll checks passed." : "\nSome checks failed — see MISS/FAIL lines above.");
process.exit(ok ? 0 : 1);
