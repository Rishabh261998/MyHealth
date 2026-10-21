import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises, meals, notes, type User } from "@/db/schema";
import { addDaysStr, startOfWeekStr, todayInTz } from "./dates";
import {
  getBodyWeightSeries,
  getDayNutrition,
  getLatestRecovery,
  getPersonalRecords,
  getPlannedSession,
  getRecentWorkouts,
} from "./queries";
import { fmtWeight } from "./units";

/**
 * A plain-text snapshot of the user's current training, nutrition and recovery
 * data for the AI coach. It is sent as a system message inside the
 * conversation (never by editing the top-level system prompt), so it must be
 * deterministic: the same data always produces the same text, and the route
 * only appends a new snapshot when this text actually changes.
 */
export async function buildCoachSnapshot(user: User): Promise<string> {
  const today = todayInTz(user.timezone);
  const weekStart = startOfWeekStr(today);

  const [planned, recent, prs, weights, nutrition, recovery, junkWeek, journal] =
    await Promise.all([
      getPlannedSession(user.id, today),
      getRecentWorkouts(user.id, 8),
      getPersonalRecords(user.id),
      getBodyWeightSeries(user.id, addDaysStr(today, -30)),
      getDayNutrition(user.id, today),
      getLatestRecovery(user.id),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(meals)
        .where(
          and(
            eq(meals.userId, user.id),
            eq(meals.isJunk, true),
            gte(meals.date, weekStart),
            lte(meals.date, today),
          ),
        ),
      db
        .select({
          date: notes.date,
          title: notes.title,
          body: notes.body,
          mood: notes.mood,
          energy: notes.energy,
        })
        .from(notes)
        .where(eq(notes.userId, user.id))
        .orderBy(desc(notes.date), desc(notes.id))
        .limit(3),
    ]);

  const unit = user.unit;
  const lines: string[] = [];

  lines.push(`Today is ${today}. Weights are shown in ${unit}.`);

  lines.push("", "Goals:");
  lines.push(`- Daily calories: ${user.dailyCalories ?? "not set"}`);
  lines.push(`- Daily protein: ${user.dailyProteinG != null ? `${user.dailyProteinG} g` : "not set"}`);
  lines.push(`- Daily water: ${user.dailyWaterMl != null ? `${user.dailyWaterMl} ml` : "not set"}`);
  lines.push(`- Junk meals per week, at most: ${user.weeklyJunkLimit ?? "not set"}`);
  if (user.targetWeightKg) lines.push(`- Target body weight: ${fmtWeight(user.targetWeightKg, unit)}`);

  lines.push("", "Today's planned session:");
  if (!planned) {
    lines.push("- Nothing planned.");
  } else {
    const swap = planned.swappedFrom ? ` (swapped in for ${planned.swappedFrom.label})` : "";
    lines.push(`- ${planned.day.label} [${planned.day.kind}]${swap}`);
    for (const item of planned.items) {
      lines.push(`  - ${item.name}: ${item.targetSets} x ${item.repLow}-${item.repHigh}`);
    }
  }

  lines.push("", "Recent sessions (newest first):");
  if (recent.length === 0) {
    lines.push("- None logged yet.");
  } else {
    for (const w of recent) {
      const parts = [`${w.date}: ${w.label} [${w.kind}]`];
      if (w.kind === "cardio") {
        if (w.distanceKm) parts.push(`${w.distanceKm} km`);
        if (w.durationMin) parts.push(`${w.durationMin} min`);
      } else {
        parts.push(`${w.sets} sets`);
        if (w.volume) parts.push(`volume ${fmtWeight(Number(w.volume), unit, 0)}`);
      }
      if (!w.finished) parts.push("not finished");
      lines.push(`- ${parts.join(", ")}`);
    }
  }

  if (prs.size > 0) {
    const names = await db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(eq(exercises.userId, user.id));
    const nameOf = new Map(names.map((e) => [e.id, e.name]));
    const best = [...prs.entries()]
      .filter(([id]) => nameOf.has(id))
      .sort((a, b) => b[1].best1rm - a[1].best1rm || a[0] - b[0])
      .slice(0, 10);
    lines.push("", "Personal records (estimated 1RM / heaviest set):");
    for (const [id, pr] of best) {
      lines.push(
        `- ${nameOf.get(id)}: ${fmtWeight(Number(pr.best1rm), unit)} / ${fmtWeight(Number(pr.topWeight), unit)}`,
      );
    }
  }

  const weighIns = weights.filter((w) => w.weightKg != null);
  lines.push("", "Body weight, last 30 days:");
  if (weighIns.length === 0) {
    lines.push("- No weigh-ins.");
  } else {
    const first = weighIns[0];
    const last = weighIns[weighIns.length - 1];
    lines.push(`- Latest: ${fmtWeight(last.weightKg, unit)} on ${last.date}`);
    if (weighIns.length > 1) {
      const change = (last.weightKg ?? 0) - (first.weightKg ?? 0);
      const sign = change > 0 ? "+" : change < 0 ? "-" : "";
      lines.push(
        `- Change since ${first.date}: ${sign}${fmtWeight(Math.abs(change), unit)} over ${weighIns.length} weigh-ins`,
      );
    }
    if (last.bodyFatPct != null) lines.push(`- Body fat: ${last.bodyFatPct}%`);
  }

  lines.push("", "Nutrition today:");
  if (nutrition.count === 0 && nutrition.waterMl === 0) {
    lines.push("- Nothing logged yet.");
  } else {
    lines.push(
      `- ${nutrition.count} meals: ${nutrition.calories} kcal, ${nutrition.protein} g protein, ${nutrition.carbs} g carbs, ${nutrition.fat} g fat`,
    );
    lines.push(`- Water: ${nutrition.waterMl} ml`);
  }
  lines.push(`- Junk meals this week: ${junkWeek[0]?.n ?? 0}`);

  lines.push("", "Recovery (latest day with data):");
  if (!recovery) {
    lines.push("- No recovery data.");
  } else {
    const parts = [recovery.date];
    if (recovery.sleep_hours != null) parts.push(`sleep ${recovery.sleep_hours} h`);
    if (recovery.sleep_score != null) parts.push(`sleep score ${recovery.sleep_score}`);
    if (recovery.resting_hr != null) parts.push(`resting HR ${recovery.resting_hr} bpm`);
    if (recovery.hrv_ms != null) parts.push(`HRV ${recovery.hrv_ms} ms`);
    if (recovery.readiness != null) parts.push(`readiness ${recovery.readiness}`);
    lines.push(`- ${parts.join(", ")}`);
  }

  if (journal.length > 0) {
    lines.push("", "Recent journal entries:");
    for (const n of journal) {
      const meta = [
        n.mood != null ? `mood ${n.mood}/5` : null,
        n.energy != null ? `energy ${n.energy}/5` : null,
      ].filter(Boolean);
      const text = [n.title, n.body].filter(Boolean).join(" - ").slice(0, 300);
      lines.push(`- ${n.date}${meta.length ? ` (${meta.join(", ")})` : ""}: ${text || "(no text)"}`);
    }
  }

  return lines.join("\n");
}
