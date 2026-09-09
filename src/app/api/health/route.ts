import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Deployment self-check. Open /api/health after deploying and it tells you
 * exactly which piece is missing, instead of leaving you with a bare
 * "server-side exception" and a digest.
 *
 * Reports only whether each secret is *present* — never its value.
 */
export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    AUTH_SECRET_long_enough: (process.env.AUTH_SECRET ?? "").length >= 16,
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    VAPID_PRIVATE_KEY: Boolean(process.env.VAPID_PRIVATE_KEY),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    ALLOW_SIGNUP: process.env.ALLOW_SIGNUP ?? "(unset — defaults to true)",
  };

  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set.");
  if (!env.AUTH_SECRET) problems.push("AUTH_SECRET is not set.");
  else if (!env.AUTH_SECRET_long_enough) {
    problems.push("AUTH_SECRET is shorter than 16 characters.");
  }

  let database: Record<string, unknown> = { reachable: false };

  if (env.DATABASE_URL) {
    try {
      const rows = await db.execute<{ table_name: string }>(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
        order by table_name
      `);
      const tables = rows.map((r) => r.table_name);
      const expected = [
        "body_metrics",
        "exercises",
        "meals",
        "notes",
        "photo_analyses",
        "photos",
        "push_subscriptions",
        "reminders",
        "routine_days",
        "routine_exercises",
        "set_logs",
        "users",
        "water_logs",
        "workouts",
      ];
      const missing = expected.filter((t) => !tables.includes(t));

      database = { reachable: true, tableCount: tables.length, missingTables: missing };

      if (missing.length > 0) {
        problems.push(
          `The database is missing ${missing.length} table(s). Redeploy — the build applies migrations — or run "npm run db:migrate" locally.`,
        );
      }
    } catch (error) {
      database = { reachable: false, error: redact(error) };
      problems.push(`Could not reach the database: ${redact(error)}`);
    }
  }

  return NextResponse.json(
    {
      status: problems.length === 0 ? "ok" : "needs attention",
      checkedAt: new Date().toISOString(),
      problems,
      env,
      database,
      pushNotifications:
        env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
          ? "configured"
          : "off — add the VAPID keys to enable reminders",
      aiPhotoAnalysis: env.ANTHROPIC_API_KEY ? "configured" : "off — optional",
    },
    { status: 200 },
  );
}

/** Never echo a connection string (and its password) back over HTTP. */
function redact(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]");
}
