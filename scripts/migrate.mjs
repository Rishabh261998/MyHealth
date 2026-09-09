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

const url = process.env.DATABASE_URL;

if (!url) {
  console.log("• No DATABASE_URL set — skipping migrations.");
  process.exit(0);
}

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
