import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { recoveryMetrics, users } from "@/db/schema";
import { normalizeIngest, type NormalizedMetric } from "@/lib/recovery";

export const dynamic = "force-dynamic";

/**
 * Universal wearable ingest. An Apple Shortcut, the Health Auto Export app, or
 * any script POSTs daily metrics here, authenticated by the user's personal
 * ingest token (Authorization: Bearer <token>, or ?token= for tools that can't
 * set headers). Accepts a single object or an array of days.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const token = bearer || url.searchParams.get("token") || "";

  if (!token) {
    return NextResponse.json({ error: "Missing ingest token." }, { status: 401 });
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.ingestToken, token))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "Invalid ingest token." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : [body];
  const normalized = items
    .map(normalizeIngest)
    .filter((m): m is NormalizedMetric => m !== null);

  if (normalized.length === 0) {
    return NextResponse.json(
      { error: "No usable records. Each needs a date (YYYY-MM-DD) and at least one metric." },
      { status: 400 },
    );
  }

  let written = 0;
  for (const m of normalized) {
    await db
      .insert(recoveryMetrics)
      .values({
        userId: user.id,
        date: m.date,
        source: "apple", // the ingest path is overwhelmingly Apple Health/Watch
        sleepHours: m.sleepHours,
        sleepScore: m.sleepScore,
        restingHr: m.restingHr,
        hrvMs: m.hrvMs,
        readiness: m.readiness,
        steps: m.steps,
        activeKcal: m.activeKcal,
      })
      .onConflictDoUpdate({
        target: [recoveryMetrics.userId, recoveryMetrics.date, recoveryMetrics.source],
        set: {
          sleepHours: m.sleepHours,
          sleepScore: m.sleepScore,
          restingHr: m.restingHr,
          hrvMs: m.hrvMs,
          readiness: m.readiness,
          steps: m.steps,
          activeKcal: m.activeKcal,
          updatedAt: new Date(),
        },
      });
    written++;
  }

  return NextResponse.json({ ok: true, written, dates: normalized.map((m) => m.date) });
}

export async function GET() {
  // A friendly hint for anyone opening the URL in a browser.
  return NextResponse.json({
    ok: true,
    usage: "POST daily metrics as JSON with your ingest token. See the Recovery screen for setup.",
  });
}
