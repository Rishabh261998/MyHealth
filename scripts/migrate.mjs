#!/usr/bin/env node
/*
 * Applies any pending SQL migrations from ./drizzle.
 *
 * This runs as part of `npm run build`, so a fresh deploy creates its own
 * tables and you never have to run anything by hand. It is idempotent: drizzle
 * records which migrations have run and skips them next time.
 *
 * With no DATABASE_URL it prints a note and exits successfully, so builds that
 * only need to compile (CI, a preview without a database) still work.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Same resolution the app uses: match on shape, not on one exact name. */
function resolveDatabaseUrl() {
  const usable = (name) => {
    const value = (process.env[name] ?? "").trim();
    return /^postgres(ql)?:\/\//i.test(value) ? value : null;
  };
  for (const name of ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "DATABASE_POSTGRES_URL"]) {
    const url = usable(name);
    if (url) return { url, source: name };
  }
  const names = Object.keys(process.env)
    .filter((n) => /(^|_)(DATABASE|POSTGRES)_URL$/i.test(n))
    .filter((n) => !/UNPOOLED|NON_POOLING|NO_SSL/i.test(n))
    .sort();
  for (const name of names) {
    const url = usable(name);
    if (url) return { url, source: name };
  }
  for (const name of Object.keys(process.env).sort()) {
    if (!/(^|_)(DATABASE|POSTGRES)_URL(_UNPOOLED|_NON_POOLING)?$/i.test(name)) continue;
    const url = usable(name);
    if (url) return { url, source: name };
  }
  return null;
}

const resolved = resolveDatabaseUrl();

if (!resolved) {
  console.log("• No Postgres connection string found — skipping migrations.");
  process.exit(0);
}

const { url, source } = resolved;
console.log(`• Using connection string from ${source}.`);

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("• Database schema is up to date.");
} catch (error) {
  console.error("✗ Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
