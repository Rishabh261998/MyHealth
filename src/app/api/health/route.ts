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
  // "missing" and "empty" look the same to most checks, but they mean very
  // different things: empty means the variable was added and its value did not
  // save — a much easier mistake to make than forgetting it entirely.
  const describe = (name: string) => {
    const raw = process.env[name];
    if (raw === undefined) return "missing";
    if (raw.trim() === "") return "present but EMPTY — the value did not save";
    return `set (${raw.trim().length} characters)`;
  };

  const isUsable = (name: string) => (process.env[name] ?? "").trim() !== "";

  const env = {
    DATABASE_URL: describe("DATABASE_URL"),
    AUTH_SECRET: describe("AUTH_SECRET"),
    CRON_SECRET: describe("CRON_SECRET"),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: describe("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    VAPID_PRIVATE_KEY: describe("VAPID_PRIVATE_KEY"),
    ANTHROPIC_API_KEY: describe("ANTHROPIC_API_KEY"),
    ALLOW_SIGNUP: describe("ALLOW_SIGNUP"),
  };

  const problems: string[] = [];
  for (const name of ["DATABASE_URL", "AUTH_SECRET"]) {
    if (process.env[name] === undefined) {
      problems.push(`${name} is missing. Add it in Vercel → Settings → Environment Variables, tick Production, then redeploy.`);
    } else if (!isUsable(name)) {
      problems.push(`${name} exists but its value is empty. Re-enter the value, save, then redeploy.`);
    }
  }
  if (isUsable("AUTH_SECRET") && process.env.AUTH_SECRET!.trim().length < 16) {
    problems.push("AUTH_SECRET is shorter than 16 characters — use a long random string.");
  }
  problems.push(
    "Reminder: environment variables only reach a deployment that was built after they were saved. Always redeploy after changing them.",
  );

  let database: Record<string, unknown> = { reachable: false };

  if (isUsable("DATABASE_URL")) {
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
      status: problems.length <= 1 ? "ok" : "needs attention",
      checkedAt: new Date().toISOString(),
      problems,
      env,
      database,
      pushNotifications:
        isUsable("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && isUsable("VAPID_PRIVATE_KEY")
          ? "configured"
          : "off — add the VAPID keys to enable reminders",
      aiPhotoAnalysis: isUsable("ANTHROPIC_API_KEY") ? "configured" : "off — optional",
    },
    { status: 200 },
  );
}

/** Never echo a connection string (and its password) back over HTTP. */
function redact(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]");
}
