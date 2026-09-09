import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exercises, setLogs, workouts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getLastPerformances, getPersonalRecords } from "@/lib/queries";
import WorkoutLogger from "./WorkoutLogger";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workoutId = Number(id);
  if (!Number.isFinite(workoutId)) notFound();

  const user = await requireUser();

  const [workout] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, user.id)))
    .limit(1);
  if (!workout) notFound();

  const rows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      position: setLogs.position,
      setNumber: setLogs.setNumber,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rpe: setLogs.rpe,
      isWarmup: setLogs.isWarmup,
      done: setLogs.done,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      kind: exercises.kind,
    })
    .from(setLogs)
    .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
    .where(eq(setLogs.workoutId, workoutId))
    .orderBy(asc(setLogs.position), asc(setLogs.setNumber));

  const library = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      kind: exercises.kind,
    })
    .from(exercises)
    .where(and(eq(exercises.userId, user.id), eq(exercises.archived, false)))
    .orderBy(asc(exercises.name));

  const [lastPerf, prs] = await Promise.all([
    getLastPerformances(user.id, workoutId),
    getPersonalRecords(user.id),
  ]);

  // Group the flat set rows back into per-exercise blocks.
  const entries: {
    exerciseId: number;
    name: string;
    muscleGroup: string;
    kind: string;
    position: number;
    sets: {
      setNumber: number;
      weightKg: number | null;
      reps: number | null;
      rpe: number | null;
      isWarmup: boolean;
      done: boolean;
    }[];
  }[] = [];

  for (const r of rows) {
    let entry = entries.find((e) => e.exerciseId === r.exerciseId);
    if (!entry) {
      entry = {
        exerciseId: r.exerciseId,
        name: r.name,
        muscleGroup: r.muscleGroup,
        kind: r.kind,
        position: r.position,
        sets: [],
      };
      entries.push(entry);
    }
    entry.sets.push({
      setNumber: r.setNumber,
      weightKg: r.weightKg,
      reps: r.reps,
      rpe: r.rpe,
      isWarmup: r.isWarmup,
      done: r.done,
    });
  }
  entries.sort((a, b) => a.position - b.position);

  return (
    <WorkoutLogger
      workout={{
        id: workout.id,
        date: workout.date,
        label: workout.label,
        kind: workout.kind,
        notes: workout.notes,
        durationMin: workout.durationMin,
        distanceKm: workout.distanceKm,
        finished: workout.finished,
      }}
      initialEntries={entries}
      library={library}
      unit={user.unit}
      lastPerformances={Object.fromEntries(lastPerf)}
      personalRecords={Object.fromEntries(prs)}
    />
  );
}
