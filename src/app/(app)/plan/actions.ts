"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { exercises, routineDays, routineExercises } from "@/db/schema";
import { requireUser } from "@/lib/auth";

/** Confirm a routine day belongs to the signed-in user before touching it. */
async function ownDay(userId: number, routineDayId: number) {
  const [row] = await db
    .select({ id: routineDays.id })
    .from(routineDays)
    .where(and(eq(routineDays.id, routineDayId), eq(routineDays.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Routine day not found.");
  return row.id;
}

export async function updateRoutineDay(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("routineDayId"));
  await ownDay(user.id, id);

  await db
    .update(routineDays)
    .set({
      label: String(formData.get("label") ?? "").trim() || "Workout",
      kind: z
        .enum(["strength", "cardio", "rest"])
        .catch("strength")
        .parse(String(formData.get("kind"))),
      notes: String(formData.get("notes") ?? "").trim(),
    })
    .where(eq(routineDays.id, id));

  revalidatePath("/plan");
  revalidatePath("/");
  revalidatePath("/workout");
}

export async function addExerciseToDay(formData: FormData) {
  const user = await requireUser();
  const routineDayId = Number(formData.get("routineDayId"));
  await ownDay(user.id, routineDayId);

  const name = String(formData.get("name") ?? "").trim();
  let exerciseId = Number(formData.get("exerciseId"));

  // A typed-in name that isn't in the library yet becomes a new exercise.
  if (!exerciseId && name) {
    const [existing] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.userId, user.id), eq(exercises.name, name)))
      .limit(1);

    if (existing) {
      exerciseId = existing.id;
    } else {
      const [created] = await db
        .insert(exercises)
        .values({
          userId: user.id,
          name,
          muscleGroup: String(formData.get("muscleGroup") ?? "other").trim() || "other",
        })
        .returning({ id: exercises.id });
      exerciseId = created.id;
    }
  }

  if (!exerciseId) return;

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${routineExercises.position}), -1)` })
    .from(routineExercises)
    .where(eq(routineExercises.routineDayId, routineDayId));

  await db.insert(routineExercises).values({
    routineDayId,
    exerciseId,
    position: max + 1,
    targetSets: Number(formData.get("sets")) || 3,
    repLow: Number(formData.get("repLow")) || 8,
    repHigh: Number(formData.get("repHigh")) || 12,
  });

  revalidatePath("/plan");
  revalidatePath("/");
  revalidatePath("/workout");
}

export async function updateRoutineExercise(
  id: number,
  patch: { targetSets?: number; repLow?: number; repHigh?: number; notes?: string },
) {
  const user = await requireUser();
  const [row] = await db
    .select({ id: routineExercises.id })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(and(eq(routineExercises.id, id), eq(routineDays.userId, user.id)))
    .limit(1);
  if (!row) throw new Error("Not found.");

  await db.update(routineExercises).set(patch).where(eq(routineExercises.id, id));
  revalidatePath("/plan");
  revalidatePath("/workout");
}

export async function removeRoutineExercise(id: number) {
  const user = await requireUser();
  const [row] = await db
    .select({ id: routineExercises.id })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(and(eq(routineExercises.id, id), eq(routineDays.userId, user.id)))
    .limit(1);
  if (!row) return;

  await db.delete(routineExercises).where(eq(routineExercises.id, id));
  revalidatePath("/plan");
  revalidatePath("/");
  revalidatePath("/workout");
}

export async function moveRoutineExercise(id: number, direction: -1 | 1) {
  const user = await requireUser();
  const [row] = await db
    .select({
      id: routineExercises.id,
      position: routineExercises.position,
      dayId: routineExercises.routineDayId,
    })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(and(eq(routineExercises.id, id), eq(routineDays.userId, user.id)))
    .limit(1);
  if (!row) return;

  const siblings = await db
    .select({ id: routineExercises.id, position: routineExercises.position })
    .from(routineExercises)
    .where(eq(routineExercises.routineDayId, row.dayId))
    .orderBy(routineExercises.position, routineExercises.id);

  const index = siblings.findIndex((s) => s.id === id);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return;

  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];

  for (const [i, s] of siblings.entries()) {
    await db.update(routineExercises).set({ position: i }).where(eq(routineExercises.id, s.id));
  }

  revalidatePath("/plan");
  revalidatePath("/workout");
}
