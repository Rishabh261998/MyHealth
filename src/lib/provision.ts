import "server-only";
import { db } from "@/db";
import { exercises, routineDays, routineExercises, reminders } from "@/db/schema";
import { DEFAULT_PLAN, DEFAULT_REMINDERS } from "./default-plan";

/**
 * Give a freshly created account its starting routine, exercise library and
 * reminder set. Safe to run once per user right after signup.
 */
export async function provisionNewUser(userId: number) {
  // 1. Every exercise mentioned anywhere in the default plan, de-duplicated.
  const byName = new Map<string, { muscleGroup: string; kind: string; notes: string }>();
  for (const day of DEFAULT_PLAN) {
    for (const ex of day.exercises) {
      if (!byName.has(ex.name)) {
        byName.set(ex.name, {
          muscleGroup: ex.muscleGroup,
          kind: ex.kind ?? "strength",
          notes: ex.notes ?? "",
        });
      }
    }
  }

  const inserted = await db
    .insert(exercises)
    .values(
      [...byName.entries()].map(([name, meta]) => ({
        userId,
        name,
        muscleGroup: meta.muscleGroup,
        kind: meta.kind,
        notes: meta.notes,
      })),
    )
    .returning({ id: exercises.id, name: exercises.name });

  const exerciseIdByName = new Map(inserted.map((e) => [e.name, e.id]));

  // 2. The weekly routine.
  for (const day of DEFAULT_PLAN) {
    const [dayRow] = await db
      .insert(routineDays)
      .values({
        userId,
        dayOfWeek: day.dayOfWeek,
        label: day.label,
        kind: day.kind,
        notes: day.notes ?? "",
      })
      .returning({ id: routineDays.id });

    if (day.exercises.length === 0) continue;

    await db.insert(routineExercises).values(
      day.exercises.map((ex, i) => ({
        routineDayId: dayRow.id,
        exerciseId: exerciseIdByName.get(ex.name)!,
        position: i,
        targetSets: ex.sets,
        repLow: ex.repLow,
        repHigh: ex.repHigh,
        notes: ex.notes ?? "",
      })),
    );
  }

  // 3. Default reminders.
  await db.insert(reminders).values(DEFAULT_REMINDERS.map((r) => ({ ...r, userId })));
}
