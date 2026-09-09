import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __sql?: ReturnType<typeof postgres>;
  __db?: Db;
};

function connect(): Db {
  if (globalForDb.__db) return globalForDb.__db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and add your Postgres connection string.",
    );
  }

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
 * Connects on first use rather than on import, so a build (or any module that
 * merely imports this file) never needs a live connection string.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const value = Reflect.get(connect(), prop, receiver);
    return typeof value === "function" ? value.bind(connect()) : value;
  },
});

export { schema };
