import { Pool } from "pg";

let pool: Pool | null = null;

// Lazily creates (and memoizes) the connection pool. DATABASE_URL is only
// validated here, at the moment a query is actually run, rather than at
// module import time. This ensures the module can be safely imported before
// Railway has finished injecting environment variables into the process.
function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  // Evolution shares its database with Qbit: `users` stays in `public`
  // (shared, so existing accounts/passwords carry over with no
  // re-registration), while every table Evolution owns lives in its own
  // `evolution` schema to avoid colliding with Qbit's incompatible tables of
  // the same name (Qbit's `expenses`/`receipts` have a completely different
  // shape). Setting search_path here means every unqualified table name in
  // this codebase resolves correctly without schema-qualifying every query.
  pool = new Pool({ connectionString, options: "-c search_path=evolution,public" });
  return pool;
}

// `db` behaves like a `pg` Pool for all existing call sites (db.query,
// db.connect, etc.), but defers actual Pool construction/validation until
// the first property access, i.e. the first real database call.
export const db: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const actualPool = getPool();
    const value = Reflect.get(actualPool, prop, actualPool);
    return typeof value === "function" ? value.bind(actualPool) : value;
  }
});
