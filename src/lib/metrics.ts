import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyMetrics,
  meals,
  recoveryMetrics,
  setLogs,
  waterLogs,
  workouts,
  type CustomMetric,
} from "@/db/schema";
import { addDaysStr, startOfWeekStr } from "./dates";
import { sourceByKey, type MetricCalc, type MetricPeriod, type MetricSource } from "./metric-sources";
import { kgToDisplay, round } from "./units";

type DayValue = { date: string; value: number };

/** Restrict a query to dates on or after `since`, when there is one. */
const from = (column: SQL, since: string | null) =>
  since ? sql` and ${column} >= ${since}` : sql``;

/**
 * One number per day for a source, oldest first. Days with nothing logged are
 * left out here; zero-filling happens later for sources that count things.
 */
async function dailyValues(
  source: MetricSource,
  userId: number,
  since: string | null,
  exerciseId: number | null,
): Promise<DayValue[]> {
  let query: SQL;

  switch (source.key) {
    case "body_weight":
    case "body_fat":
    case "waist": {
      const column = {
        body_weight: sql`weight_kg`,
        body_fat: sql`body_fat_pct`,
        waist: sql`waist_cm`,
      }[source.key];
      query = sql`
        select date::text as date, ${column}::float8 as value
        from ${bodyMetrics}
        where user_id = ${userId} and ${column} is not null${from(sql`date`, since)}`;
      break;
    }

    case "calories":
    case "protein": {
      const column = source.key === "calories" ? sql`calories` : sql`protein_g`;
      query = sql`
        select date::text as date, sum(${column})::float8 as value
        from ${meals}
        where user_id = ${userId} and ${column} is not null${from(sql`date`, since)}
        group by date`;
      break;
    }

    case "junk_meals":
      query = sql`
        select date::text as date, count(*)::float8 as value
        from ${meals}
        where user_id = ${userId} and is_junk = true${from(sql`date`, since)}
        group by date`;
      break;

    case "water":
      query = sql`
        select date::text as date, ml::float8 as value
        from ${waterLogs}
        where user_id = ${userId} and ml > 0${from(sql`date`, since)}`;
      break;

    case "sleep_hours":
    case "resting_hr":
    case "hrv":
    case "readiness":
    case "steps": {
      // Several sources (Oura, Apple Watch…) can report the same day; take the highest.
      const column = {
        sleep_hours: sql`sleep_hours`,
        resting_hr: sql`resting_hr`,
        hrv: sql`hrv_ms`,
        readiness: sql`readiness`,
        steps: sql`steps`,
      }[source.key];
      query = sql`
        select date::text as date, max(${column})::float8 as value
        from ${recoveryMetrics}
        where user_id = ${userId} and ${column} is not null${from(sql`date`, since)}
        group by date`;
      break;
    }

    case "sessions":
      query = sql`
        select date::text as date, count(*)::float8 as value
        from ${workouts}
        where user_id = ${userId}${from(sql`date`, since)}
        group by date`;
      break;

    case "cardio_km":
      query = sql`
        select date::text as date, sum(distance_km)::float8 as value
        from ${workouts}
        where user_id = ${userId} and distance_km is not null${from(sql`date`, since)}
        group by date`;
      break;

    case "volume":
    case "working_sets":
    case "exercise_e1rm": {
      const value = {
        volume: sql`sum(s.weight_kg * s.reps)`,
        working_sets: sql`count(*)`,
        exercise_e1rm: sql`max(s.weight_kg * (1 + s.reps / 30.0))`,
      }[source.key];
      const needsLoad =
        source.key === "working_sets" ? sql`` : sql` and s.weight_kg is not null and s.reps is not null`;
      const exercise =
        source.key === "exercise_e1rm" ? sql` and s.exercise_id = ${exerciseId ?? -1}` : sql``;
      query = sql`
        select w.date::text as date, ${value}::float8 as value
        from ${setLogs} s
        join ${workouts} w on w.id = s.workout_id
        where w.user_id = ${userId}
          and s.done = true
          and s.is_warmup = false${needsLoad}${exercise}${from(sql`w.date`, since)}
        group by w.date`;
      break;
    }

    default:
      return [];
  }

  const rows = await db.execute<{ date: string; value: number | null }>(sql`${query} order by 1`);
  return rows
    .filter((r) => r.value != null && Number.isFinite(Number(r.value)))
    .map((r) => ({ date: r.date, value: Number(r.value) }));
}

function combine(values: number[], calc: MetricCalc) {
  if (calc === "sum") return values.reduce((a, b) => a + b, 0);
  if (calc === "max") return Math.max(...values);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type MetricPoint = { date: string; value: number };

export type MetricSeries = {
  source: MetricSource;
  points: MetricPoint[];
  stats: { latest: number | null; average: number | null; change: number | null; total: number | null };
};

/**
 * The plotted series for one saved metric: daily values, zero-filled for
 * counting sources, grouped into days or weeks and combined with its calc.
 */
export async function computeMetric(
  metric: Pick<CustomMetric, "source" | "exerciseId" | "period" | "calc" | "rangeDays">,
  userId: number,
  today: string,
  weightUnit: string,
): Promise<MetricSeries | null> {
  const source = sourceByKey(metric.source);
  if (!source) return null;

  const period = metric.period as MetricPeriod;
  const calc = (source.calcs.includes(metric.calc as MetricCalc) ? metric.calc : source.calcs[0]) as MetricCalc;
  // Start on a week boundary so the first week isn't a partial one.
  const since =
    metric.rangeDays > 0
      ? period === "week"
        ? startOfWeekStr(addDaysStr(today, -metric.rangeDays))
        : addDaysStr(today, -metric.rangeDays + 1)
      : null;

  let days = await dailyValues(source, userId, since, metric.exerciseId);

  if (source.zeroFill) {
    const start = since ?? days[0]?.date;
    if (start) {
      const byDate = new Map(days.map((d) => [d.date, d.value]));
      const filled: DayValue[] = [];
      for (let d = start; d <= today; d = addDaysStr(d, 1)) {
        filled.push({ date: d, value: byDate.get(d) ?? 0 });
      }
      days = filled;
    }
  }

  const buckets = new Map<string, number[]>();
  for (const d of days) {
    const key = period === "week" ? startOfWeekStr(d.date) : d.date;
    const list = buckets.get(key) ?? [];
    list.push(d.value);
    buckets.set(key, list);
  }

  const convert = (v: number) =>
    source.unit === "weight" ? (kgToDisplay(v, weightUnit) ?? v) : v;

  const points = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      value: round(convert(period === "day" ? values[0] : combine(values, calc)), source.digits),
    }));

  const values = points.map((p) => p.value);
  const isTotal = calc === "sum";

  return {
    source,
    points,
    stats: {
      latest: values.at(-1) ?? null,
      average: values.length ? round(combine(values, "avg"), source.digits) : null,
      change:
        !isTotal && values.length > 1 ? round(values.at(-1)! - values[0], source.digits) : null,
      total: isTotal && values.length ? round(combine(values, "sum"), source.digits) : null,
    },
  };
}
