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
        "DATABASE_URL is not set, so this page cannot read the database. " +
          "Open /api/health for a full check of this deployment.",
      );
    },
  });
}

const connectionString = process.env.DATABASE_URL;

/**
 * A configured deployment gets a plain Drizzle client with no indirection at
 * all; only a misconfigured one ever sees the proxy above.
 */
export const db: Db = connectionString ? create(connectionString) : unconfigured();

export { schema };
