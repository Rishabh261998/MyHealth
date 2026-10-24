/**
 * What a custom metric can be built from. Shared by the builder form (client)
 * and the series queries in metrics.ts (server), so it holds no database code.
 */

export type MetricCalc = "avg" | "sum" | "max";
export type MetricPeriod = "day" | "week";

export type MetricSource = {
  key: string;
  label: string;
  group: "Body" | "Nutrition" | "Recovery" | "Training";
  /** The unit shown next to values; "weight" means the user's lb/kg setting. */
  unit: "weight" | string;
  /** Ways to combine the days in a week. The first is the default. */
  calcs: MetricCalc[];
  /** Days or weeks with nothing logged count as 0 (for counts and totals). */
  zeroFill: boolean;
  /** Decimal places to show. */
  digits: number;
  needsExercise?: boolean;
};

export const METRIC_SOURCES: MetricSource[] = [
  { key: "body_weight", label: "Body weight", group: "Body", unit: "weight", calcs: ["avg", "max"], zeroFill: false, digits: 1 },
  { key: "body_fat", label: "Body fat", group: "Body", unit: "%", calcs: ["avg", "max"], zeroFill: false, digits: 1 },
  { key: "waist", label: "Waist", group: "Body", unit: "cm", calcs: ["avg", "max"], zeroFill: false, digits: 1 },

  { key: "calories", label: "Calories eaten", group: "Nutrition", unit: "kcal", calcs: ["avg", "sum", "max"], zeroFill: false, digits: 0 },
  { key: "protein", label: "Protein eaten", group: "Nutrition", unit: "g", calcs: ["avg", "sum", "max"], zeroFill: false, digits: 0 },
  { key: "water", label: "Water", group: "Nutrition", unit: "ml", calcs: ["avg", "sum", "max"], zeroFill: false, digits: 0 },
  { key: "junk_meals", label: "Junk meals", group: "Nutrition", unit: "meals", calcs: ["sum", "avg"], zeroFill: true, digits: 0 },

  { key: "sleep_hours", label: "Sleep", group: "Recovery", unit: "h", calcs: ["avg", "max"], zeroFill: false, digits: 1 },
  { key: "resting_hr", label: "Resting heart rate", group: "Recovery", unit: "bpm", calcs: ["avg", "max"], zeroFill: false, digits: 0 },
  { key: "hrv", label: "HRV", group: "Recovery", unit: "ms", calcs: ["avg", "max"], zeroFill: false, digits: 0 },
  { key: "readiness", label: "Readiness", group: "Recovery", unit: "score", calcs: ["avg", "max"], zeroFill: false, digits: 0 },
  { key: "steps", label: "Steps", group: "Recovery", unit: "steps", calcs: ["avg", "sum", "max"], zeroFill: false, digits: 0 },

  { key: "sessions", label: "Workouts", group: "Training", unit: "sessions", calcs: ["sum"], zeroFill: true, digits: 0 },
  { key: "volume", label: "Training volume", group: "Training", unit: "weight", calcs: ["sum", "avg", "max"], zeroFill: true, digits: 0 },
  { key: "working_sets", label: "Working sets", group: "Training", unit: "sets", calcs: ["sum", "avg", "max"], zeroFill: true, digits: 0 },
  { key: "cardio_km", label: "Cardio distance", group: "Training", unit: "km", calcs: ["sum", "avg", "max"], zeroFill: true, digits: 1 },
  { key: "exercise_e1rm", label: "Lift: estimated 1RM", group: "Training", unit: "weight", calcs: ["max", "avg"], zeroFill: false, digits: 1, needsExercise: true },
];

export const CALC_LABELS: Record<MetricCalc, string> = {
  avg: "Average",
  sum: "Total",
  max: "Best",
};

export const RANGE_OPTIONS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 365, label: "1 year" },
  { days: 0, label: "All time" },
];

export function sourceByKey(key: string) {
  return METRIC_SOURCES.find((s) => s.key === key);
}

export function unitLabel(source: MetricSource, weightUnit: string) {
  return source.unit === "weight" ? weightUnit : source.unit;
}

/** One-tap starters for an empty Metrics screen. */
export const STARTER_METRICS: { name: string; source: string; period: MetricPeriod; calc: MetricCalc; rangeDays: number }[] = [
  { name: "Weekly workouts", source: "sessions", period: "week", calc: "sum", rangeDays: 90 },
  { name: "Body weight, weekly average", source: "body_weight", period: "week", calc: "avg", rangeDays: 90 },
  { name: "Weekly training volume", source: "volume", period: "week", calc: "sum", rangeDays: 90 },
  { name: "Daily protein", source: "protein", period: "day", calc: "avg", rangeDays: 30 },
  { name: "Sleep, weekly average", source: "sleep_hours", period: "week", calc: "avg", rangeDays: 90 },
];
