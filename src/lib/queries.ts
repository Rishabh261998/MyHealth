import "server-only";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { addDaysStr, dowOfDateString, startOfWeekStr } from "./dates";
import {
  bodyMetrics,
  dayOverrides,
  exercises,
  friendships,
  recoveryMetrics,
  wearableConnections,
  meals,
  photos,
  routineDays,
  routineExercises,
  setLogs,
  waterLogs,
  users,
  workouts,
  type RoutineDay,
} from "@/db/schema";

/** The exercises belonging to one routine day, in order. */
async function loadRoutineItems(routineDayId: number) {
  return db
    .select({
      id: routineExercises.id,
      exerciseId: routineExercises.exerciseId,
      position: routineExercises.position,
      targetSets: routineExercises.targetSets,
      repLow: routineExercises.repLow,
      repHigh: routineExercises.repHigh,
      notes: routineExercises.notes,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      kind: exercises.kind,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineExercises.routineDayId, routineDayId))
    .orderBy(asc(routineExercises.position), asc(routineExercises.id));
}

/** The planned session for a weekday, with its exercises in order. */
export async function getRoutineForDay(userId: number, dayOfWeek: number) {
  const [day] = await db
    .select()
    .from(routineDays)
    .where(and(eq(routineDays.userId, userId), eq(routineDays.dayOfWeek, dayOfWeek)))
    .limit(1);

  if (!day) return null;
  return { day, items: await loadRoutineItems(day.id) };
}

export type PlannedSession = {
  day: RoutineDay;
  items: Awaited<ReturnType<typeof loadRoutineItems>>;
  /** The session the weekly plan calls for, when it has been swapped away. */
  swappedFrom: RoutineDay | null;
};

/**
 * What to train on a given date: the weekly plan, unless a one-off swap says
 * otherwise. Everything user-facing should go through this rather than reading
 * the plan by weekday directly.
 */
export async function getPlannedSession(
  userId: number,
  date: string,
): Promise<PlannedSession | null> {
  const dayOfWeek = dowOfDateString(date);

  const [planned] = await db
    .select()
    .from(routineDays)
    .where(and(eq(routineDays.userId, userId), eq(routineDays.dayOfWeek, dayOfWeek)))
    .limit(1);

  const [override] = await db
    .select({ routineDayId: dayOverrides.routineDayId })
    .from(dayOverrides)
    .where(and(eq(dayOverrides.userId, userId), eq(dayOverrides.date, date)))
    .limit(1);

  if (override) {
    const [swapped] = await db
      .select()
      .from(routineDays)
      .where(
        and(eq(routineDays.id, override.routineDayId), eq(routineDays.userId, userId)),
      )
      .limit(1);

    if (swapped) {
      return {
        day: swapped,
        items: await loadRoutineItems(swapped.id),
        swappedFrom: planned ?? null,
      };
    }
  }

  if (!planned) return null;
  return { day: planned, items: await loadRoutineItems(planned.id), swappedFrom: null };
}

/**
 * Every session in the weekly plan, flagged with whether it has already been
 * trained during the week containing `date` — so a swap picker can lead with
 * the ones that were missed.
 */
export async function getWeekCoverage(userId: number, date: string) {
  const weekStart = startOfWeekStr(date);
  const weekEnd = addDaysStr(weekStart, 6);

  const days = await db
    .select()
    .from(routineDays)
    .where(eq(routineDays.userId, userId))
    .orderBy(asc(routineDays.dayOfWeek));

  const done = await db
    .select({ routineDayId: workouts.routineDayId, date: workouts.date })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        gte(workouts.date, weekStart),
        lte(workouts.date, weekEnd),
      ),
    );

  const doneIds = new Set(done.map((d) => d.routineDayId).filter(Boolean));

  return days
    .map((day) => ({
      id: day.id,
      label: day.label,
      kind: day.kind,
      dayOfWeek: day.dayOfWeek,
      doneThisWeek: doneIds.has(day.id),
    }))
    // Monday first — that is how a training week reads.
    .sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7));
}

export async function getFullRoutine(userId: number) {
  const days = await db
    .select()
    .from(routineDays)
    .where(eq(routineDays.userId, userId))
    .orderBy(asc(routineDays.dayOfWeek));

  const items = await db
    .select({
      id: routineExercises.id,
      routineDayId: routineExercises.routineDayId,
      exerciseId: routineExercises.exerciseId,
      position: routineExercises.position,
      targetSets: routineExercises.targetSets,
      repLow: routineExercises.repLow,
      repHigh: routineExercises.repHigh,
      notes: routineExercises.notes,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      kind: exercises.kind,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(eq(routineDays.userId, userId))
    .orderBy(asc(routineExercises.position), asc(routineExercises.id));

  return days.map((d) => ({ day: d, items: items.filter((i) => i.routineDayId === d.id) }));
}

export type LastPerformance = {
  date: string;
  sets: { setNumber: number; weightKg: number | null; reps: number | null; rpe: number | null }[];
  topWeightKg: number | null;
  best1rm: number | null;
};

/**
 * For every exercise the user has ever logged, the sets from the most recent
 * day they trained it — this is what powers the "last time you did…" hints.
 * `excludeWorkoutId` keeps the session you are currently filling in out of it.
 */
export async function getLastPerformances(
  userId: number,
  excludeWorkoutId?: number,
): Promise<Map<number, LastPerformance>> {
  const rows = await db.execute<{
    exercise_id: number;
    date: string;
    set_number: number;
    weight_kg: number | null;
    reps: number | null;
    rpe: number | null;
  }>(sql`
    select exercise_id, date, set_number, weight_kg, reps, rpe from (
      select s.exercise_id,
             w.date::text as date,
             s.set_number,
             s.weight_kg,
             s.reps,
             s.rpe,
             dense_rank() over (partition by s.exercise_id order by w.date desc) as rnk
      from ${setLogs} s
      join ${workouts} w on w.id = s.workout_id
      where w.user_id = ${userId}
        and s.is_warmup = false
        and s.done = true
        and ${excludeWorkoutId ? sql`w.id <> ${excludeWorkoutId}` : sql`true`}
    ) t
    where rnk = 1
    order by exercise_id, set_number
  `);

  const map = new Map<number, LastPerformance>();
  for (const r of rows) {
    const entry = map.get(r.exercise_id) ?? {
      date: r.date,
      sets: [],
      topWeightKg: null,
      best1rm: null,
    };
    entry.sets.push({
      setNumber: r.set_number,
      weightKg: r.weight_kg,
      reps: r.reps,
      rpe: r.rpe,
    });
    if (r.weight_kg != null) {
      entry.topWeightKg = Math.max(entry.topWeightKg ?? 0, r.weight_kg);
      if (r.reps) {
        const e1rm = r.weight_kg * (1 + r.reps / 30);
        entry.best1rm = Math.max(entry.best1rm ?? 0, e1rm);
      }
    }
    map.set(r.exercise_id, entry);
  }
  return map;
}

/** All-time best estimated 1RM per exercise — used to flag new PRs. */
export async function getPersonalRecords(userId: number) {
  const rows = await db.execute<{ exercise_id: number; best_1rm: number; top_weight: number }>(sql`
    select s.exercise_id,
           max(s.weight_kg * (1 + s.reps / 30.0)) as best_1rm,
           max(s.weight_kg) as top_weight
    from ${setLogs} s
    join ${workouts} w on w.id = s.workout_id
    where w.user_id = ${userId}
      and s.is_warmup = false
      and s.done = true
      and s.weight_kg is not null
      and s.reps is not null
    group by s.exercise_id
  `);
  return new Map(rows.map((r) => [r.exercise_id, { best1rm: r.best_1rm, topWeight: r.top_weight }]));
}

/** Weight-over-time series for one exercise (top set + estimated 1RM per day). */
export async function getExerciseHistory(userId: number, exerciseId: number) {
  return db.execute<{
    date: string;
    top_weight: number;
    best_1rm: number;
    volume: number;
    sets: number;
  }>(sql`
    select w.date::text as date,
           max(s.weight_kg) as top_weight,
           max(s.weight_kg * (1 + s.reps / 30.0)) as best_1rm,
           sum(s.weight_kg * s.reps) as volume,
           count(*)::int as sets
    from ${setLogs} s
    join ${workouts} w on w.id = s.workout_id
    where w.user_id = ${userId}
      and s.exercise_id = ${exerciseId}
      and s.is_warmup = false
      and s.done = true
      and s.weight_kg is not null
      and s.reps is not null
    group by w.date
    order by w.date asc
  `);
}

export async function getBodyWeightSeries(userId: number, sinceDate?: string) {
  const where = sinceDate
    ? and(eq(bodyMetrics.userId, userId), gte(bodyMetrics.date, sinceDate))
    : eq(bodyMetrics.userId, userId);

  return db
    .select({
      date: bodyMetrics.date,
      weightKg: bodyMetrics.weightKg,
      bodyFatPct: bodyMetrics.bodyFatPct,
      waistCm: bodyMetrics.waistCm,
    })
    .from(bodyMetrics)
    .where(where)
    .orderBy(asc(bodyMetrics.date));
}

/** Total tonnage per calendar week — a simple "am I doing more work?" signal. */
export async function getWeeklyVolume(userId: number, weeks = 12) {
  return db.execute<{ week: string; volume: number; sets: number; sessions: number }>(sql`
    select to_char(date_trunc('week', w.date), 'YYYY-MM-DD') as week,
           coalesce(sum(s.weight_kg * s.reps), 0) as volume,
           count(s.id)::int as sets,
           count(distinct w.id)::int as sessions
    from ${workouts} w
    left join ${setLogs} s
      on s.workout_id = w.id and s.is_warmup = false and s.done = true
    where w.user_id = ${userId}
      and w.date >= (current_date - (${weeks * 7})::int)
    group by 1
    order by 1 asc
  `);
}

export async function getDayNutrition(userId: number, date: string) {
  const [totals] = await db
    .select({
      calories: sql<number>`coalesce(sum(${meals.calories}), 0)::int`,
      protein: sql<number>`coalesce(sum(${meals.proteinG}), 0)::int`,
      carbs: sql<number>`coalesce(sum(${meals.carbsG}), 0)::int`,
      fat: sql<number>`coalesce(sum(${meals.fatG}), 0)::int`,
      junk: sql<number>`coalesce(sum(case when ${meals.isJunk} then 1 else 0 end), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.date, date)));

  const [water] = await db
    .select({ ml: waterLogs.ml })
    .from(waterLogs)
    .where(and(eq(waterLogs.userId, userId), eq(waterLogs.date, date)))
    .limit(1);

  return { ...totals, waterMl: water?.ml ?? 0 };
}

export async function getRecentWorkouts(userId: number, limit = 10) {
  return db
    .select({
      id: workouts.id,
      date: workouts.date,
      label: workouts.label,
      kind: workouts.kind,
      finished: workouts.finished,
      durationMin: workouts.durationMin,
      distanceKm: workouts.distanceKm,
      sets: sql<number>`(select count(*)::int from ${setLogs} s where s.workout_id = ${workouts.id} and s.done = true)`,
      volume: sql<number>`(select coalesce(sum(s.weight_kg * s.reps), 0) from ${setLogs} s where s.workout_id = ${workouts.id} and s.done = true and s.is_warmup = false)`,
    })
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(desc(workouts.date), desc(workouts.id))
    .limit(limit);
}

export async function getLatestPhotos(userId: number, limit = 12) {
  return db
    .select()
    .from(photos)
    .where(eq(photos.userId, userId))
    .orderBy(desc(photos.date), desc(photos.id))
    .limit(limit);
}

/** How many days in a row (ending today or yesterday) had a logged workout. */
export async function getWorkoutStreak(userId: number, today: string) {
  const rows = await db
    .select({ date: workouts.date })
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(desc(workouts.date))
    .limit(120);

  const dates = new Set(rows.map((r) => r.date));
  if (dates.size === 0) return 0;

  const step = (d: string, n: number) => {
    const [y, m, dd] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  };

  let cursor = dates.has(today) ? today : step(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = step(cursor, -1);
  }
  return streak;
}


/* ---------------------------------------------------------- leaderboards */

export type LeaderboardEntry = {
  userId: number;
  name: string;
  isMe: boolean;
  sessionsWeek: number;
  setsWeek: number;
  volumeKgWeek: number;
  streak: number;
};

/** The user ids you are connected to (mutual friends), plus yourself. */
export async function getFriendIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ friendId: friendships.friendId })
    .from(friendships)
    .where(eq(friendships.userId, userId));
  return [userId, ...rows.map((r) => r.friendId)];
}

/**
 * Weekly stats for a set of users, ranked for a leaderboard. Ranking is by
 * sessions trained this week, then volume — effort, not just how strong
 * someone already is, so a beginner can top a friends board by showing up.
 */
export async function getLeaderboard(
  userIds: number[],
  currentUserId: number,
  weekStart: string,
): Promise<LeaderboardEntry[]> {
  if (userIds.length === 0) return [];

  const idList = sql.join(
    userIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const stats = await db.execute<{
    id: number;
    name: string;
    sessions_week: number;
    sets_week: number;
    volume_week: number;
  }>(sql`
    select u.id,
           u.name,
           (select count(*)::int from ${workouts} w
              where w.user_id = u.id and w.date >= ${weekStart}) as sessions_week,
           (select count(*)::int from ${setLogs} s
              join ${workouts} w on w.id = s.workout_id
              where w.user_id = u.id and w.date >= ${weekStart}
                and s.done = true and s.is_warmup = false) as sets_week,
           (select coalesce(sum(s.weight_kg * s.reps), 0) from ${setLogs} s
              join ${workouts} w on w.id = s.workout_id
              where w.user_id = u.id and w.date >= ${weekStart}
                and s.done = true and s.is_warmup = false
                and s.weight_kg is not null and s.reps is not null) as volume_week
    from ${users} u
    where u.id in (${idList})
  `);

  const weekEnd = addDaysStr(weekStart, 6);
  const withStreak = await Promise.all(
    stats.map(async (row) => ({
      userId: row.id,
      name: row.name || "Anonymous",
      isMe: row.id === currentUserId,
      sessionsWeek: Number(row.sessions_week),
      setsWeek: Number(row.sets_week),
      volumeKgWeek: Number(row.volume_week),
      streak: await getWorkoutStreak(row.id, weekEnd),
    })),
  );

  return withStreak.sort(
    (a, b) =>
      b.sessionsWeek - a.sessionsWeek ||
      b.volumeKgWeek - a.volumeKgWeek ||
      b.streak - a.streak ||
      a.name.localeCompare(b.name),
  );
}

/** Everyone who has opted into the public board (capped for a sane page). */
export async function getPublicLeaderboardIds(limitUsers = 100): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.publicLeaderboard, true))
    .limit(limitUsers);
  return rows.map((r) => r.id);
}

export async function getFriends(userId: number) {
  return db
    .select({ id: users.id, name: users.name })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.friendId))
    .where(eq(friendships.userId, userId))
    .orderBy(asc(users.name));
}


/* ------------------------------------------------------ recovery / sleep */

/**
 * The best recovery figures per day over a window, collapsing multiple sources
 * into one row (any non-null value wins; ties prefer the most recently updated
 * source via the ORDER BY feeding the DISTINCT ON is not needed since we
 * aggregate with max/coalesce over the small per-day set).
 */
export async function getRecoverySeries(userId: number, sinceDate: string) {
  return db.execute<{
    date: string;
    sleep_hours: number | null;
    sleep_score: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
    readiness: number | null;
    steps: number | null;
    active_kcal: number | null;
  }>(sql`
    select date::text as date,
           max(sleep_hours) as sleep_hours,
           max(sleep_score) as sleep_score,
           max(resting_hr) as resting_hr,
           max(hrv_ms) as hrv_ms,
           max(readiness) as readiness,
           max(steps) as steps,
           max(active_kcal) as active_kcal
    from ${recoveryMetrics}
    where user_id = ${userId} and date >= ${sinceDate}
    group by date
    order by date asc
  `);
}

/** The single most recent day that has any recovery data. */
export async function getLatestRecovery(userId: number) {
  const [row] = await db.execute<{
    date: string;
    sleep_hours: number | null;
    sleep_score: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
    readiness: number | null;
  }>(sql`
    select date::text as date,
           max(sleep_hours) as sleep_hours,
           max(sleep_score) as sleep_score,
           max(resting_hr) as resting_hr,
           max(hrv_ms) as hrv_ms,
           max(readiness) as readiness
    from ${recoveryMetrics}
    where user_id = ${userId}
    group by date
    order by date desc
    limit 1
  `);
  return row ?? null;
}

export async function getWearableConnections(userId: number) {
  return db
    .select()
    .from(wearableConnections)
    .where(eq(wearableConnections.userId, userId));
}
