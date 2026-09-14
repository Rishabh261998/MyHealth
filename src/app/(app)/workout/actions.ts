"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dayOverrides, routineDays, setLogs, workouts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { getLastPerformances, getPlannedSession } from "@/lib/queries";

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

  const routine = await getPlannedSession(user.id, date);

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
  if (routine) await seedFromRoutine(user.id, created.id, routine.items);

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

  // Finishing a session confirms it: any set with reps entered counts as done,
  // so pre-filled sets the lifter kept are included without tapping each check.
  const finishing = data.finished === true;
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
      done: finishing && s.reps != null ? true : s.done,
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


/* ------------------------------------------------------ swapping sessions */

/**
 * Seed a workout's set rows from a routine day. Used when a session is created
 * and again when it is swapped before any real logging has happened.
 */
async function seedFromRoutine(
  userId: number,
  workoutId: number,
  items: { exerciseId: number; position: number; targetSets: number }[],
) {
  await db.delete(setLogs).where(eq(setLogs.workoutId, workoutId));
  if (items.length === 0) return;

  // Pre-fill each set with what was lifted last time so the logger opens ready
  // to confirm rather than blank. The values are editable defaults; sets start
  // not-done and are marked done when the workout is finished.
  const last = await getLastPerformances(userId);

  await db.insert(setLogs).values(
    items.flatMap((item) => {
      const prev = last.get(item.exerciseId);
      const working = prev?.sets ?? []; // getLastPerformances already excludes warm-ups
      return Array.from({ length: Math.max(1, item.targetSets) }, (_, i) => {
        const ref = working[i] ?? working[working.length - 1];
        return {
          workoutId,
          exerciseId: item.exerciseId,
          position: item.position,
          setNumber: i + 1,
          weightKg: ref?.weightKg ?? null,
          reps: ref?.reps ?? null,
          done: false,
        };
      });
    }),
  );
}

/** True once anything real has been entered — a weight, a rep, a ticked set. */
async function hasLoggedWork(workoutId: number) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(setLogs)
    .where(
      and(
        eq(setLogs.workoutId, workoutId),
        sql`(${setLogs.weightKg} is not null or ${setLogs.reps} is not null or ${setLogs.done} = true)`,
      ),
    );
  return (row?.n ?? 0) > 0;
}

export type SwapResult =
  | { ok: true; rebuilt: boolean }
  | { ok: false; error: string };

/**
 * Swap the session for a single date — "I missed Monday's push day, do it
 * today". The weekly plan is untouched; only this date changes.
 */
export async function swapSession(date: string, routineDayId: number): Promise<SwapResult> {
  const user = await requireUser();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "That is not a valid date." };
  }

  const [day] = await db
    .select()
    .from(routineDays)
    .where(and(eq(routineDays.id, routineDayId), eq(routineDays.userId, user.id)))
    .limit(1);
  if (!day) return { ok: false, error: "That session is not in your plan." };

  const blocked = await sessionAlreadyStarted(user.id, date);
  if (blocked) return { ok: false, error: blocked };

  await db
    .insert(dayOverrides)
    .values({ userId: user.id, date, routineDayId })
    .onConflictDoUpdate({
      target: [dayOverrides.userId, dayOverrides.date],
      set: { routineDayId },
    });

  const rebuilt = await applySwapToExistingWorkout(user.id, date);

  revalidatePath("/");
  revalidatePath("/workout");
  return { ok: true, rebuilt };
}

/** Drop the swap for a date and go back to whatever the weekly plan says. */
export async function clearSwap(date: string): Promise<SwapResult> {
  const user = await requireUser();

  const blocked = await sessionAlreadyStarted(user.id, date);
  if (blocked) return { ok: false, error: blocked };

  await db
    .delete(dayOverrides)
    .where(and(eq(dayOverrides.userId, user.id), eq(dayOverrides.date, date)));

  const rebuilt = await applySwapToExistingWorkout(user.id, date);

  revalidatePath("/");
  revalidatePath("/workout");
  return { ok: true, rebuilt };
}

/**
 * Swapping once real sets exist would leave the plan and the session
 * disagreeing — the day would claim one workout while the logger showed
 * another. Refuse instead, and say what to do about it.
 */
async function sessionAlreadyStarted(userId: number, date: string): Promise<string | null> {
  const [workout] = await db
    .select({ id: workouts.id, label: workouts.label })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.date, date)))
    .limit(1);
  if (!workout) return null;
  if (!(await hasLoggedWork(workout.id))) return null;

  return `You have already logged sets in today's ${workout.label} session. Finish it, or delete it from the session screen, and then swap.`;
}

/**
 * If the day's session was already opened but nothing has been logged yet,
 * rebuild it from the newly chosen routine day. A session with real sets in it
 * is left alone — swapping must never delete work someone already did.
 */
async function applySwapToExistingWorkout(userId: number, date: string) {
  const [workout] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.date, date)))
    .limit(1);
  if (!workout) return false;

  if (await hasLoggedWork(workout.id)) return false;

  const routine = await getPlannedSession(userId, date);
  if (!routine) return false;

  await db
    .update(workouts)
    .set({
      label: routine.day.label,
      kind: routine.day.kind === "rest" ? "strength" : routine.day.kind,
      routineDayId: routine.day.id,
    })
    .where(eq(workouts.id, workout.id));

  await seedFromRoutine(userId, workout.id, routine.items);
  revalidatePath(`/workout/${workout.id}`);
  return true;
}
