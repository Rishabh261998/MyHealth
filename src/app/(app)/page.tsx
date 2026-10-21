import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  ArrowRight,
  Camera,
  Droplets,
  Dumbbell,
  Flame,
  Plus,
  Scale,
  UtensilsCrossed,
} from "lucide-react";
import { db } from "@/db";
import { bodyMetrics, meals, workouts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  DAY_NAMES,
  addDaysStr,
  daysBetween,
  dowInTz,
  startOfWeekStr,
  todayInTz,
} from "@/lib/dates";
import { getDayNutrition, getLatestRecovery, getPlannedSession, getWorkoutStreak } from "@/lib/queries";
import { fmtWeight, kgToDisplay, round } from "@/lib/units";
import Stat from "@/components/Stat";
import PushPrompt from "@/components/PushPrompt";
import QuickWater from "@/components/QuickWater";
import { startTodaysWorkout } from "./workout/actions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const today = todayInTz(user.timezone);
  const dow = dowInTz(user.timezone);
  const weekStart = startOfWeekStr(today);

  const [routine, nutrition, streak, recovery] = await Promise.all([
    getPlannedSession(user.id, today),
    getDayNutrition(user.id, today),
    getWorkoutStreak(user.id, today),
    getLatestRecovery(user.id),
  ]);

  const [todayWorkout] = await db
    .select({ id: workouts.id, finished: workouts.finished, label: workouts.label })
    .from(workouts)
    .where(and(eq(workouts.userId, user.id), eq(workouts.date, today)))
    .limit(1);

  const recentWeights = await db
    .select({ date: bodyMetrics.date, weightKg: bodyMetrics.weightKg })
    .from(bodyMetrics)
    .where(and(eq(bodyMetrics.userId, user.id), sql`${bodyMetrics.weightKg} is not null`))
    .orderBy(desc(bodyMetrics.date))
    .limit(60);

  const latestWeight = recentWeights[0] ?? null;
  const monthAgo = addDaysStr(today, -30);
  const older = recentWeights.find((w) => w.date <= monthAgo) ?? recentWeights.at(-1) ?? null;
  const weightDelta =
    latestWeight?.weightKg != null && older?.weightKg != null && older.date !== latestWeight.date
      ? latestWeight.weightKg - older.weightKg
      : null;

  const [junkWeek] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(meals)
    .where(
      and(eq(meals.userId, user.id), eq(meals.isJunk, true), gte(meals.date, weekStart)),
    );

  const [sessionsWeek] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workouts)
    .where(and(eq(workouts.userId, user.id), gte(workouts.date, weekStart)));

  const junkLimit = user.weeklyJunkLimit ?? 3;
  const junkCount = junkWeek?.n ?? 0;
  const calorieGoal = user.dailyCalories ?? 2200;
  const proteinGoal = user.dailyProteinG ?? 140;
  const waterGoal = user.dailyWaterMl ?? 3000;
  const isRest = routine?.day.kind === "rest";
  const daysSinceWeighIn = latestWeight ? daysBetween(latestWeight.date, today) : null;

  return (
    <>
      <header className="mb-5">
        <p className="text-sm text-muted">{DAY_NAMES[dow]}</p>
        <h1 className="text-2xl font-bold tracking-tight">
          {user.name ? `Hey ${user.name.split(" ")[0]}` : "Today"}
        </h1>
      </header>

      <PushPrompt />

      {/* ---------------------------------------------------- today's plan */}
      <section className="card mb-4 border-brand/40 bg-gradient-to-br from-[var(--brand-soft)] to-[var(--surface)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="h-section">Today&apos;s session</p>
            <h2 className="mt-1 truncate text-xl font-bold">
              {routine?.day.label ?? "No plan yet"}
            </h2>
            {routine && routine.items.length > 0 && (
              <p className="mt-0.5 text-sm text-muted">
                {routine.items.length} exercises
                {todayWorkout?.finished ? " · done ✅" : ""}
              </p>
            )}
            {isRest && <p className="mt-0.5 text-sm text-muted">Rest and recover.</p>}
            {routine?.swappedFrom && (
              <p className="mt-1 text-xs text-brand">
                Swapped — plan says {routine.swappedFrom.label}
              </p>
            )}
          </div>
          <Dumbbell size={32} className="shrink-0 text-brand" />
        </div>

        {routine && routine.items.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {routine.items.slice(0, 7).map((i) => (
              <li key={i.id} className="chip">
                {i.name}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-2">
          {todayWorkout ? (
            <Link href={`/workout/${todayWorkout.id}`} className="btn-primary flex-1">
              {todayWorkout.finished ? "Review session" : "Continue session"}
              <ArrowRight size={16} />
            </Link>
          ) : (
            <form action={startTodaysWorkout.bind(null, undefined)} className="flex-1">
              <button type="submit" className="btn-primary w-full">
                {isRest ? "Log a workout" : "Start workout"} <ArrowRight size={16} />
              </button>
            </form>
          )}
          <Link href="/plan" className="btn-ghost px-3">
            Plan
          </Link>
        </div>
      </section>

      {/* --------------------------------------------------------- numbers */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat
          label="Body weight"
          value={fmtWeight(latestWeight?.weightKg, user.unit)}
          sub={
            weightDelta != null
              ? `${weightDelta > 0 ? "+" : ""}${round(kgToDisplay(weightDelta, user.unit) ?? 0, 1)} ${user.unit} in 30 days`
              : daysSinceWeighIn == null
                ? "Not logged yet"
                : daysSinceWeighIn === 0
                  ? "Logged today"
                  : `${daysSinceWeighIn} days ago`
          }
        />
        <Stat
          label="Calories today"
          value={nutrition.calories || 0}
          sub={`of ${calorieGoal} kcal`}
          tone={nutrition.calories > calorieGoal ? "warn" : "default"}
        />
        <Stat
          label="Protein today"
          value={`${nutrition.protein || 0}g`}
          sub={`of ${proteinGoal}g`}
          tone={nutrition.protein >= proteinGoal ? "good" : "default"}
        />
        <Stat
          label="Junk this week"
          value={junkCount}
          sub={`limit ${junkLimit}`}
          tone={junkCount > junkLimit ? "bad" : junkCount === junkLimit ? "warn" : "good"}
        />
      </div>

      {junkCount > junkLimit && (
        <div className="card mb-4 flex items-start gap-3 border-[var(--bad)]/40">
          <Flame size={20} className="mt-0.5 shrink-0 text-[var(--bad)]" />
          <div>
            <p className="font-semibold">You are over your junk-food budget</p>
            <p className="mt-0.5 text-sm text-muted">
              {junkCount} unhealthy meals logged since {startOfWeekStr(today)} against a limit of{" "}
              {junkLimit}. Nothing is ruined — just make the next meal a clean one.
            </p>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- water */}
      <QuickWater
        date={today}
        current={nutrition.waterMl}
        goal={waterGoal}
      />

      {/* -------------------------------------------------- quick actions */}
      <h2 className="h-section mb-2 mt-5">Quick log</h2>
      <div className="grid grid-cols-2 gap-3">
        <QuickLink href="/nutrition" icon={<UtensilsCrossed size={18} />} label="Add a meal" />
        <QuickLink href="/body" icon={<Scale size={18} />} label="Log weight" />
        <QuickLink href="/photos" icon={<Camera size={18} />} label="Progress photo" />
        <QuickLink href="/notes" icon={<Plus size={18} />} label="Add a note" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Workout streak" value={`${streak}d`} sub="consecutive days trained" />
        <Stat
          label="Sessions this week"
          value={sessionsWeek?.n ?? 0}
          sub="target 6 (5 lifts + run)"
          tone={(sessionsWeek?.n ?? 0) >= 6 ? "good" : "default"}
        />
      </div>

      {recovery && (recovery.sleep_hours != null || recovery.readiness != null) && (
        <>
          <h2 className="h-section mb-2 mt-5">Recovery</h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Last sleep"
              value={
                recovery.sleep_hours != null
                  ? `${Math.round(Number(recovery.sleep_hours) * 10) / 10}h`
                  : "—"
              }
              sub={recovery.sleep_score != null ? `score ${recovery.sleep_score}` : "hours"}
            />
            <Stat
              label="Readiness"
              value={recovery.readiness != null ? String(recovery.readiness) : "—"}
              sub={recovery.resting_hr != null ? `resting HR ${recovery.resting_hr}` : "today"}
              tone={
                recovery.readiness == null
                  ? "default"
                  : recovery.readiness >= 70
                    ? "good"
                    : recovery.readiness >= 50
                      ? "warn"
                      : "bad"
              }
            />
          </div>
        </>
      )}

      <Link
        href="/progress"
        className="mt-5 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5"
      >
        <span className="font-medium">See your progress charts</span>
        <ArrowRight size={18} className="text-muted" />
      </Link>
    </>
  );
}

function QuickLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm font-medium"
    >
      <span className="text-brand">{icon}</span>
      {label}
    </Link>
  );
}
