"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { setLogs, workouts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dowInTz, todayInTz } from "@/lib/dates";
import { getRoutineForDay } from "@/lib/queries";

/** Open today's session, creating it from the weekly plan on first use. */
export async function startTodaysWorkout(dateOverride?: string) {
  const user = await requireUser();
  const date = dateOverride ?? todayInTz(user.timezone);

  const [existing] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.userId, user.id), eq(workouts.date, date)))
    .orderBy(workouts.id)
    .limit(1);

  if (existing) redirect(`/workout/${existing.id}`);

  const dow = dateOverride
    ? new Date(`${dateOverride}T00:00:00Z`).getUTCDay()
    : dowInTz(user.timezone);
  const routine = await getRoutineForDay(user.id, dow);

  const [created] = await db
    .insert(workouts)
    .values({
      userId: user.id,
      date,
      label: routine?.day.label ?? "Workout",
      kind: routine?.day.kind === "rest" ? "strength" : (routine?.day.kind ?? "strength"),
      routineDayId: routine?.day.id ?? null,
    })
    .returning({ id: workouts.id });

  // Pre-fill the empty set rows from the plan so the logger opens ready to use.
  if (routine && routine.items.length > 0) {
    const rows = routine.items.flatMap((item) =>
      Array.from({ length: Math.max(1, item.targetSets) }, (_, i) => ({
        workoutId: created.id,
        exerciseId: item.exerciseId,
        position: item.position,
        setNumber: i + 1,
        weightKg: null,
        reps: null,
        done: false,
      })),
    );
    if (rows.length) await db.insert(setLogs).values(rows);
  }

  revalidatePath("/workout");
  redirect(`/workout/${created.id}`);
}

const setSchema = z.object({
  setNumber: z.number().int().min(1),
  weightKg: z.number().nullable(),
  reps: z.number().int().nullable(),
  rpe: z.number().nullable(),
  isWarmup: z.boolean(),
  done: z.boolean(),
});

const savePayload = z.object({
  workoutId: z.number().int(),
  label: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  durationMin: z.number().int().nullable().optional(),
  distanceKm: z.number().nullable().optional(),
  finished: z.boolean().optional(),
  entries: z.array(
    z.object({
      exerciseId: z.number().int(),
      position: z.number().int(),
      sets: z.array(setSchema),
    }),
  ),
});

export type SavePayload = z.infer<typeof savePayload>;

/** Replace the whole session in one shot — simplest thing that stays correct. */
export async function saveWorkout(input: SavePayload) {
  const user = await requireUser();
  const data = savePayload.parse(input);

  const [owned] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.id, data.workoutId), eq(workouts.userId, user.id)))
    .limit(1);
  if (!owned) throw new Error("Workout not found.");

  await db
    .update(workouts)
    .set({
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.durationMin !== undefined ? { durationMin: data.durationMin } : {}),
      ...(data.distanceKm !== undefined ? { distanceKm: data.distanceKm } : {}),
      ...(data.finished !== undefined ? { finished: data.finished } : {}),
    })
    .where(eq(workouts.id, data.workoutId));

  await db.delete(setLogs).where(eq(setLogs.workoutId, data.workoutId));

  const rows = data.entries.flatMap((e) =>
    e.sets.map((s) => ({
      workoutId: data.workoutId,
      exerciseId: e.exerciseId,
      position: e.position,
      setNumber: s.setNumber,
      weightKg: s.weightKg,
      reps: s.reps,
      rpe: s.rpe,
      isWarmup: s.isWarmup,
      done: s.done,
    })),
  );
  if (rows.length) await db.insert(setLogs).values(rows);

  revalidatePath(`/workout/${data.workoutId}`);
  revalidatePath("/workout");
  revalidatePath("/");
  revalidatePath("/progress");
  return { ok: true as const };
}

export async function deleteWorkout(workoutId: number) {
  const user = await requireUser();
  await db
    .delete(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, user.id)));
  revalidatePath("/workout");
  revalidatePath("/");
  redirect("/workout");
}
