import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bodyMetrics, meals, recoveryMetrics, waterLogs, workouts } from "@/db/schema";
import { authenticateApiKey, hasScope, type ApiAuth } from "@/lib/apikey";
import { addDaysStr, todayInTz } from "@/lib/dates";
import {
  getDayNutrition,
  getPlannedSession,
  getRecentWorkouts,
  getRecoverySeries,
  getWorkoutStreak,
} from "@/lib/queries";
import { normalizeIngest } from "@/lib/recovery";
import { KG_PER_LB } from "@/lib/units";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store", "access-control-allow-origin": "*" },
  });

const err = (status: number, message: string) => json({ error: message }, status);

/** A self-describing index so a developer can discover the surface. */
const INDEX = {
  name: "MyHealth API",
  version: "v1",
  auth: "Send your key as `Authorization: Bearer <key>` or `X-API-Key: <key>`.",
  endpoints: [
    { method: "GET", path: "/api/v1", scope: null, desc: "This index." },
    { method: "GET", path: "/api/v1/me", scope: "read", desc: "Profile and goals." },
    { method: "GET", path: "/api/v1/summary", scope: "read", desc: "Today's snapshot: nutrition, water, weight, planned session, streak." },
    { method: "GET", path: "/api/v1/workouts?limit=", scope: "read", desc: "Recent workouts." },
    { method: "GET", path: "/api/v1/body?since=YYYY-MM-DD", scope: "read", desc: "Body-metric history." },
    { method: "GET", path: "/api/v1/nutrition?date=YYYY-MM-DD", scope: "read", desc: "A day's meals and totals." },
    { method: "GET", path: "/api/v1/recovery?since=YYYY-MM-DD", scope: "read", desc: "Sleep / HRV / readiness history." },
    { method: "POST", path: "/api/v1/body", scope: "write", desc: "Add or update a day's body metrics. Body: {date?, weightKg|weightLb, bodyFatPct?, waistCm?...}." },
    { method: "POST", path: "/api/v1/meals", scope: "write", desc: "Log a meal. Body: {name, date?, slot?, calories?, proteinG?, carbsG?, fatG?, isJunk?}." },
    { method: "POST", path: "/api/v1/water", scope: "write", desc: "Add water. Body: {date?, ml}." },
    { method: "POST", path: "/api/v1/recovery", scope: "write", desc: "Upsert recovery. Body: {date, sleepHours?, restingHr?, hrv?, readiness?, steps?, activeKcal?}." },
  ],
};

export async function GET(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const route = path.join("/");

  if (route === "") return json(INDEX);

  const auth = await authenticateApiKey(request);
  if (!auth) return err(401, "Invalid or missing API key.");
  if (!hasScope(auth, "read")) return err(403, "This key lacks the 'read' scope.");

  const url = new URL(request.url);
  const tz = auth.user.timezone || "UTC";

  switch (route) {
    case "me":
      return json({
        id: auth.user.id,
        name: auth.user.name,
        email: auth.user.email,
        timezone: auth.user.timezone,
        unit: auth.user.unit,
        goals: {
          targetWeightKg: auth.user.targetWeightKg,
          dailyCalories: auth.user.dailyCalories,
          dailyProteinG: auth.user.dailyProteinG,
          dailyWaterMl: auth.user.dailyWaterMl,
          weeklyJunkLimit: auth.user.weeklyJunkLimit,
        },
      });

    case "summary": {
      const today = todayInTz(tz);
      const [nutrition, plan, streak, latestWeight] = await Promise.all([
        getDayNutrition(auth.user.id, today),
        getPlannedSession(auth.user.id, today).catch(() => null),
        getWorkoutStreak(auth.user.id, today),
        db
          .select({ date: bodyMetrics.date, weightKg: bodyMetrics.weightKg })
          .from(bodyMetrics)
          .where(eq(bodyMetrics.userId, auth.user.id))
          .orderBy(desc(bodyMetrics.date))
          .limit(1),
      ]);
      return json({
        date: today,
        nutrition,
        water: { ml: nutrition.waterMl, goalMl: auth.user.dailyWaterMl },
        plannedSession: plan ? { label: plan.day.label, kind: plan.day.kind } : null,
        workoutStreakDays: streak,
        latestWeightKg: latestWeight[0]?.weightKg ?? null,
      });
    }

    case "workouts": {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      const rows = await getRecentWorkouts(auth.user.id, limit);
      return json({ workouts: rows });
    }

    case "body": {
      const since = url.searchParams.get("since") ?? addDaysStr(todayInTz(tz), -90);
      const rows = await db
        .select()
        .from(bodyMetrics)
        .where(and(eq(bodyMetrics.userId, auth.user.id)))
        .orderBy(asc(bodyMetrics.date));
      return json({ since, metrics: rows.filter((r) => r.date >= since) });
    }

    case "nutrition": {
      const date = url.searchParams.get("date") ?? todayInTz(tz);
      const [totals, dayMeals] = await Promise.all([
        getDayNutrition(auth.user.id, date),
        db
          .select()
          .from(meals)
          .where(and(eq(meals.userId, auth.user.id), eq(meals.date, date)))
          .orderBy(asc(meals.time)),
      ]);
      return json({ date, totals, meals: dayMeals });
    }

    case "recovery": {
      const since = url.searchParams.get("since") ?? addDaysStr(todayInTz(tz), -30);
      const rows = await getRecoverySeries(auth.user.id, since);
      return json({ since, days: rows });
    }

    default:
      return err(404, `Unknown endpoint /api/v1/${route}. GET /api/v1 lists them all.`);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const route = path.join("/");

  const auth = await authenticateApiKey(request);
  if (!auth) return err(401, "Invalid or missing API key.");
  if (!hasScope(auth, "write")) return err(403, "This key lacks the 'write' scope.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, "Body must be JSON.");
  }

  const tz = auth.user.timezone || "UTC";

  switch (route) {
    case "body":
      return postBody(auth, body, tz);
    case "meals":
      return postMeal(auth, body, tz);
    case "water":
      return postWater(auth, body, tz);
    case "recovery":
      return postRecovery(auth, body);
    default:
      return err(404, `Unknown endpoint /api/v1/${route}. GET /api/v1 lists them all.`);
  }
}

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

async function postBody(auth: ApiAuth, body: unknown, tz: string) {
  const schema = z.object({
    date: dateField,
    weightKg: z.number().positive().optional(),
    weightLb: z.number().positive().optional(),
    bodyFatPct: z.number().min(0).max(100).optional(),
    waistCm: z.number().positive().optional(),
    chestCm: z.number().positive().optional(),
    armCm: z.number().positive().optional(),
    thighCm: z.number().positive().optional(),
    notes: z.string().max(2000).optional(),
  });
  const p = schema.safeParse(body);
  if (!p.success) return err(400, p.error.issues[0].message);

  const date = p.data.date ?? todayInTz(tz);
  const weightKg = p.data.weightKg ?? (p.data.weightLb != null ? p.data.weightLb * KG_PER_LB : null);

  const values = {
    weightKg,
    bodyFatPct: p.data.bodyFatPct ?? null,
    waistCm: p.data.waistCm ?? null,
    chestCm: p.data.chestCm ?? null,
    armCm: p.data.armCm ?? null,
    thighCm: p.data.thighCm ?? null,
    notes: p.data.notes ?? "",
  };
  await db
    .insert(bodyMetrics)
    .values({ userId: auth.user.id, date, ...values })
    .onConflictDoUpdate({ target: [bodyMetrics.userId, bodyMetrics.date], set: values });

  return json({ ok: true, date }, 201);
}

async function postMeal(auth: ApiAuth, body: unknown, tz: string) {
  const schema = z.object({
    name: z.string().min(1).max(200),
    date: dateField,
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    slot: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
    calories: z.number().int().min(0).optional(),
    proteinG: z.number().int().min(0).optional(),
    carbsG: z.number().int().min(0).optional(),
    fatG: z.number().int().min(0).optional(),
    isJunk: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
  });
  const p = schema.safeParse(body);
  if (!p.success) return err(400, p.error.issues[0].message);

  const [row] = await db
    .insert(meals)
    .values({
      userId: auth.user.id,
      date: p.data.date ?? todayInTz(tz),
      time: p.data.time ?? "12:00",
      name: p.data.name,
      slot: p.data.slot ?? "snack",
      calories: p.data.calories ?? null,
      proteinG: p.data.proteinG ?? null,
      carbsG: p.data.carbsG ?? null,
      fatG: p.data.fatG ?? null,
      isJunk: p.data.isJunk ?? false,
      notes: p.data.notes ?? "",
    })
    .returning({ id: meals.id });

  return json({ ok: true, id: row.id }, 201);
}

async function postWater(auth: ApiAuth, body: unknown, tz: string) {
  const schema = z.object({ date: dateField, ml: z.number().int() });
  const p = schema.safeParse(body);
  if (!p.success) return err(400, p.error.issues[0].message);

  const date = p.data.date ?? todayInTz(tz);
  const [existing] = await db
    .select({ ml: waterLogs.ml })
    .from(waterLogs)
    .where(and(eq(waterLogs.userId, auth.user.id), eq(waterLogs.date, date)))
    .limit(1);
  const total = Math.max(0, (existing?.ml ?? 0) + p.data.ml);

  await db
    .insert(waterLogs)
    .values({ userId: auth.user.id, date, ml: total })
    .onConflictDoUpdate({ target: [waterLogs.userId, waterLogs.date], set: { ml: total } });

  return json({ ok: true, date, totalMl: total }, 201);
}

async function postRecovery(auth: ApiAuth, body: unknown) {
  const m = normalizeIngest(body);
  if (!m) return err(400, "Need at least a date (YYYY-MM-DD) and one metric.");

  const values = {
    sleepHours: m.sleepHours,
    sleepScore: m.sleepScore,
    restingHr: m.restingHr,
    hrvMs: m.hrvMs,
    readiness: m.readiness,
    steps: m.steps,
    activeKcal: m.activeKcal,
  };
  await db
    .insert(recoveryMetrics)
    .values({ userId: auth.user.id, date: m.date, source: "api", ...values })
    .onConflictDoUpdate({
      target: [recoveryMetrics.userId, recoveryMetrics.date, recoveryMetrics.source],
      set: { ...values, updatedAt: new Date() },
    });

  return json({ ok: true, date: m.date }, 201);
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-api-key, content-type",
    },
  });
}
