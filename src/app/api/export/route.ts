import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyMetrics,
  customMetrics,
  exercises,
  meals,
  notes,
  photos,
  reminders,
  routineDays,
  routineExercises,
  setLogs,
  waterLogs,
  workouts,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Everything the account holds, as one JSON file. No lock-in. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const includePhotos = new URL(request.url).searchParams.get("photos") === "1";

  const [
    exerciseRows,
    dayRows,
    routineExerciseRows,
    workoutRows,
    setRows,
    metricRows,
    mealRows,
    waterRows,
    noteRows,
    reminderRows,
    photoRows,
    customMetricRows,
  ] = await Promise.all([
    db.select().from(exercises).where(eq(exercises.userId, user.id)),
    db.select().from(routineDays).where(eq(routineDays.userId, user.id)),
    db
      .select({
        id: routineExercises.id,
        routineDayId: routineExercises.routineDayId,
        exerciseId: routineExercises.exerciseId,
        position: routineExercises.position,
        targetSets: routineExercises.targetSets,
        repLow: routineExercises.repLow,
        repHigh: routineExercises.repHigh,
      })
      .from(routineExercises)
      .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
      .where(eq(routineDays.userId, user.id)),
    db.select().from(workouts).where(eq(workouts.userId, user.id)),
    db
      .select({
        id: setLogs.id,
        workoutId: setLogs.workoutId,
        exerciseId: setLogs.exerciseId,
        setNumber: setLogs.setNumber,
        weightKg: setLogs.weightKg,
        reps: setLogs.reps,
        rpe: setLogs.rpe,
        isWarmup: setLogs.isWarmup,
        done: setLogs.done,
      })
      .from(setLogs)
      .innerJoin(workouts, eq(workouts.id, setLogs.workoutId))
      .where(eq(workouts.userId, user.id)),
    db.select().from(bodyMetrics).where(eq(bodyMetrics.userId, user.id)),
    db.select().from(meals).where(eq(meals.userId, user.id)),
    db.select().from(waterLogs).where(eq(waterLogs.userId, user.id)),
    db.select().from(notes).where(eq(notes.userId, user.id)),
    db.select().from(reminders).where(eq(reminders.userId, user.id)),
    db.select().from(photos).where(eq(photos.userId, user.id)),
    db.select().from(customMetrics).where(eq(customMetrics.userId, user.id)),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: {
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      unit: user.unit,
      targetWeightKg: user.targetWeightKg,
      dailyCalories: user.dailyCalories,
      dailyProteinG: user.dailyProteinG,
      dailyWaterMl: user.dailyWaterMl,
      weeklyJunkLimit: user.weeklyJunkLimit,
    },
    exercises: exerciseRows,
    routineDays: dayRows,
    routineExercises: routineExerciseRows,
    workouts: workoutRows,
    setLogs: setRows,
    bodyMetrics: metricRows,
    meals: mealRows,
    waterLogs: waterRows,
    notes: noteRows,
    reminders: reminderRows,
    customMetrics: customMetricRows,
    // Image bytes are huge; include them only when explicitly asked for.
    photos: photoRows.map((p) =>
      includePhotos ? p : { ...p, dataUrl: "[omitted — add ?photos=1 to include]" },
    ),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="myhealth-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
