/**
 * Normalizing wearable data into our own shape. Kept free of DB and network so
 * it can be unit-tested directly against the documented API payloads.
 */

export type NormalizedMetric = {
  date: string; // YYYY-MM-DD
  sleepHours: number | null;
  sleepScore: number | null;
  restingHr: number | null;
  hrvMs: number | null;
  readiness: number | null;
  steps: number | null;
  activeKcal: number | null;
};

const clampPct = (n: unknown): number | null => {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
};

const posInt = (n: unknown): number | null => {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
};

const posNum = (n: unknown): number | null => {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : null;
};

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Merge daily-sleep and daily-readiness documents from the Oura v2 API. */
export function normalizeOura(
  sleep: unknown[],
  readiness: unknown[],
): NormalizedMetric[] {
  const byDate = new Map<string, NormalizedMetric>();

  const get = (day: string): NormalizedMetric => {
    let m = byDate.get(day);
    if (!m) {
      m = {
        date: day,
        sleepHours: null,
        sleepScore: null,
        restingHr: null,
        hrvMs: null,
        readiness: null,
        steps: null,
        activeKcal: null,
      };
      byDate.set(day, m);
    }
    return m;
  };

  for (const raw of sleep) {
    const d = raw as Record<string, unknown>;
    if (!isDate(d.day)) continue;
    const m = get(d.day);
    m.sleepScore = clampPct(d.score) ?? m.sleepScore;
    const contrib = (d.contributors ?? {}) as Record<string, unknown>;
    // total_sleep_duration lives on the detailed sleep doc; daily_sleep carries
    // a score. Accept either total seconds if present.
    const totalSec = posNum(d.total_sleep_duration);
    if (totalSec != null) m.sleepHours = Math.round((totalSec / 3600) * 10) / 10;
    if (m.restingHr == null) m.restingHr = posInt(d.lowest_heart_rate);
    void contrib;
  }

  for (const raw of readiness) {
    const d = raw as Record<string, unknown>;
    if (!isDate(d.day)) continue;
    const m = get(d.day);
    m.readiness = clampPct(d.score) ?? m.readiness;
    const contrib = (d.contributors ?? {}) as Record<string, unknown>;
    if (m.restingHr == null) m.restingHr = posInt(contrib.resting_heart_rate ?? d.resting_heart_rate);
    if (m.hrvMs == null) m.hrvMs = posInt(contrib.hrv_balance ?? d.hrv);
    const temp = d.temperature_deviation;
    void temp;
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Normalize a detailed Oura sleep document (has total_sleep_duration, hr, hrv). */
export function normalizeOuraSleepDetail(docs: unknown[]): NormalizedMetric[] {
  const out: NormalizedMetric[] = [];
  for (const raw of docs) {
    const d = raw as Record<string, unknown>;
    if (!isDate(d.day)) continue;
    const totalSec = posNum(d.total_sleep_duration);
    out.push({
      date: d.day,
      sleepHours: totalSec != null ? Math.round((totalSec / 3600) * 10) / 10 : null,
      sleepScore: null,
      restingHr: posInt(d.average_heart_rate ?? d.lowest_heart_rate),
      hrvMs: posInt(d.average_hrv),
      readiness: null,
      steps: null,
      activeKcal: null,
    });
  }
  return out;
}

/**
 * A single normalized daily record from an arbitrary ingest payload (Apple
 * Watch via Shortcuts, a script, etc.). Tolerant of missing fields and of a few
 * common key spellings.
 */
export function normalizeIngest(payload: unknown): NormalizedMetric | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const date = p.date ?? p.day;
  if (!isDate(date)) return null;

  const pick = (...keys: string[]) => {
    for (const k of keys) if (p[k] != null) return p[k];
    return undefined;
  };

  return {
    date,
    sleepHours: posNum(pick("sleepHours", "sleep_hours", "sleep")),
    sleepScore: clampPct(pick("sleepScore", "sleep_score")),
    restingHr: posInt(pick("restingHr", "resting_hr", "restingHeartRate", "rhr")),
    hrvMs: posInt(pick("hrvMs", "hrv", "hrv_ms")),
    readiness: clampPct(pick("readiness", "recovery", "recoveryScore", "recovery_score")),
    steps: posInt(pick("steps", "stepCount")),
    activeKcal: posInt(pick("activeKcal", "active_kcal", "activeEnergy", "activeCalories")),
  };
}

/** Merge several normalized records for the same day, last non-null wins. */
export function mergeMetric(
  base: NormalizedMetric,
  next: Partial<NormalizedMetric>,
): NormalizedMetric {
  const merged = { ...base };
  for (const key of Object.keys(next) as (keyof NormalizedMetric)[]) {
    const value = next[key];
    if (key !== "date" && value != null) (merged[key] as unknown) = value;
  }
  return merged;
}
