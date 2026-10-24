"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customMetrics, exercises } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { METRIC_SOURCES, RANGE_OPTIONS, STARTER_METRICS, sourceByKey } from "@/lib/metric-sources";

const MAX_METRICS = 20;

const metricSchema = z.object({
  name: z.string().trim().min(1, "Give the metric a name.").max(60),
  source: z.enum(METRIC_SOURCES.map((s) => s.key) as [string, ...string[]]),
  exerciseId: z.number().int().positive().nullable(),
  period: z.enum(["day", "week"]),
  calc: z.enum(["avg", "sum", "max"]),
  rangeDays: z.number().int().refine((d) => RANGE_OPTIONS.some((r) => r.days === d)),
});

async function metricCount(userId: number) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customMetrics)
    .where(eq(customMetrics.userId, userId));
  return row?.n ?? 0;
}

export async function createMetric(input: z.infer<typeof metricSchema>) {
  const user = await requireUser();
  const parsed = metricSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const source = sourceByKey(data.source)!;
  if (!source.calcs.includes(data.calc)) {
    return { ok: false as const, error: "That calculation doesn't apply to this metric." };
  }

  let exerciseId: number | null = null;
  if (source.needsExercise) {
    if (!data.exerciseId) return { ok: false as const, error: "Pick an exercise." };
    const [own] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.id, data.exerciseId), eq(exercises.userId, user.id)))
      .limit(1);
    if (!own) return { ok: false as const, error: "Exercise not found." };
    exerciseId = own.id;
  }

  if ((await metricCount(user.id)) >= MAX_METRICS) {
    return { ok: false as const, error: `You can keep up to ${MAX_METRICS} metrics. Delete one first.` };
  }

  await db.insert(customMetrics).values({
    userId: user.id,
    name: data.name,
    source: data.source,
    exerciseId,
    period: data.period,
    calc: data.calc,
    rangeDays: data.rangeDays,
  });

  revalidatePath("/metrics");
  return { ok: true as const };
}

export async function addStarterMetrics() {
  const user = await requireUser();
  if ((await metricCount(user.id)) > 0) return;

  await db
    .insert(customMetrics)
    .values(STARTER_METRICS.map((m) => ({ ...m, userId: user.id, exerciseId: null })));
  revalidatePath("/metrics");
}

export async function deleteMetric(id: number) {
  const user = await requireUser();
  await db
    .delete(customMetrics)
    .where(and(eq(customMetrics.id, id), eq(customMetrics.userId, user.id)));
  revalidatePath("/metrics");
}
