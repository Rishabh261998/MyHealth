import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __sql?: ReturnType<typeof postgres>;
  __db?: Db;
};

function create(connectionString: string): Db {
  if (globalForDb.__db) return globalForDb.__db;

  const sql =
    globalForDb.__sql ??
    postgres(connectionString, {
      max: 1,
      prepare: false, // required for transaction-mode poolers (Neon/Supabase)
      idle_timeout: 20,
    });

  const instance = drizzle(sql, { schema });

  // Reuse across hot reloads and warm serverless invocations.
  globalForDb.__sql = sql;
  globalForDb.__db = instance;
  return instance;
}

/**
 * Property names that frameworks probe on values they did not create: React
 * checks `$$typeof` when serializing, `await` checks `then`, serializers check
 * `toJSON`. Answering these must never throw — otherwise a missing
 * DATABASE_URL takes down every route, including the ones that never query.
 */
const PROBE_KEYS = new Set([
  "then",
  "catch",
  "finally",
  "$$typeof",
  "toJSON",
  "constructor",
  "prototype",
  "nodeType",
  "displayName",
  "_owner",
  "_store",
]);

/**
 * Stand-in used when DATABASE_URL is missing. Importing it is harmless — pages
 * that never query still render, so the app can show its own error page and
 * /api/health can explain what is wrong. Only an actual query complains.
 */
function unconfigured(): Db {
  return new Proxy({} as Db, {
    get(_target, prop) {
      if (typeof prop === "symbol" || PROBE_KEYS.has(prop)) return undefined;
      throw new Error(
        "No Postgres connection string was found, so this page cannot read the " +
          "database. Open /api/health for a full check of this deployment.",
      );
    },
  });
}

/**
 * Find the Postgres connection string, whatever the host decided to call it.
 *
 * Vercel's storage integrations name this differently depending on provider and
 * on whether a custom prefix was set (DATABASE_URL, POSTGRES_URL,
 * STORAGE_DATABASE_URL, ...), so match on shape rather than on one exact name.
 * Pooled URLs are preferred — serverless functions should not hold direct
 * connections.
 */
export function resolveDatabaseUrl(): { url: string; source: string } | null {
  const usable = (name: string) => {
    const value = (process.env[name] ?? "").trim();
    return /^postgres(ql)?:\/\//i.test(value) ? value : null;
  };

  // Exact names first, most specific and most pooled first.
  for (const name of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "DATABASE_POSTGRES_URL",
  ]) {
    const url = usable(name);
    if (url) return { url, source: name };
  }

  // Then anything shaped like a prefixed connection string, skipping the
  // direct-connection variants the integrations also publish.
  const candidates = Object.keys(process.env)
    .filter((name) => /(^|_)(DATABASE|POSTGRES)_URL$/i.test(name))
    .filter((name) => !/UNPOOLED|NON_POOLING|NO_SSL/i.test(name))
    .sort();

  for (const name of candidates) {
    const url = usable(name);
    if (url) return { url, source: name };
  }

  // Last resort: an unpooled URL still beats no database at all.
  for (const name of Object.keys(process.env).sort()) {
    if (!/(^|_)(DATABASE|POSTGRES)_URL(_UNPOOLED|_NON_POOLING)?$/i.test(name)) continue;
    const url = usable(name);
    if (url) return { url, source: name };
  }

  return null;
}

const resolved = resolveDatabaseUrl();
const connectionString = resolved?.url;

/**
 * A configured deployment gets a plain Drizzle client with no indirection at
 * all; only a misconfigured one ever sees the proxy above.
 */
export const db: Db = connectionString ? create(connectionString) : unconfigured();

export { schema };
