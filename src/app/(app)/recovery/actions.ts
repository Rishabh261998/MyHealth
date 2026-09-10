"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { recoveryMetrics, users, wearableConnections } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayInTz, addDaysStr } from "@/lib/dates";
import { fetchOura } from "@/lib/oura";
import type { NormalizedMetric } from "@/lib/recovery";

/** Persist normalized daily metrics from one source (upsert per day+source). */
async function storeMetrics(userId: number, source: string, metrics: NormalizedMetric[]) {
  let written = 0;
  for (const m of metrics) {
    // Skip completely empty days so a source that returns a stub doesn't create
    // a blank row that hides another source's data.
    const hasData =
      m.sleepHours != null ||
      m.sleepScore != null ||
      m.restingHr != null ||
      m.hrvMs != null ||
      m.readiness != null ||
      m.steps != null ||
      m.activeKcal != null;
    if (!hasData) continue;

    await db
      .insert(recoveryMetrics)
      .values({
        userId,
        date: m.date,
        source,
        sleepHours: m.sleepHours,
        sleepScore: m.sleepScore,
        restingHr: m.restingHr,
        hrvMs: m.hrvMs,
        readiness: m.readiness,
        steps: m.steps,
        activeKcal: m.activeKcal,
      })
      .onConflictDoUpdate({
        target: [recoveryMetrics.userId, recoveryMetrics.date, recoveryMetrics.source],
        set: {
          sleepHours: m.sleepHours,
          sleepScore: m.sleepScore,
          restingHr: m.restingHr,
          hrvMs: m.hrvMs,
          readiness: m.readiness,
          steps: m.steps,
          activeKcal: m.activeKcal,
          updatedAt: new Date(),
        },
      });
    written++;
  }
  return written;
}

export type SyncResult = { ok: boolean; message: string };

/** Save an Oura personal access token and immediately pull recent data. */
export async function connectOura(formData: FormData): Promise<SyncResult> {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "").trim();
  if (token.length < 20) {
    return { ok: false, message: "That does not look like an Oura token. Copy the whole thing." };
  }

  await db
    .insert(wearableConnections)
    .values({ userId: user.id, source: "oura", accessToken: token })
    .onConflictDoUpdate({
      target: [wearableConnections.userId, wearableConnections.source],
      set: { accessToken: token },
    });

  return syncOura();
}

export async function syncOura(): Promise<SyncResult> {
  const user = await requireUser();

  const [conn] = await db
    .select()
    .from(wearableConnections)
    .where(and(eq(wearableConnections.userId, user.id), eq(wearableConnections.source, "oura")))
    .limit(1);
  if (!conn) return { ok: false, message: "Connect Oura first." };

  const today = todayInTz(user.timezone);
  const start = addDaysStr(today, -30);

  try {
    const metrics = await fetchOura(conn.accessToken, start, today);
    const written = await storeMetrics(user.id, "oura", metrics);
    const message =
      written > 0
        ? `Synced ${written} day${written === 1 ? "" : "s"} from Oura.`
        : "Connected, but Oura returned no data for the last 30 days.";

    await db
      .update(wearableConnections)
      .set({ lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncMessage: message })
      .where(eq(wearableConnections.id, conn.id));

    revalidatePath("/recovery");
    revalidatePath("/");
    return { ok: true, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Oura sync failed.";
    await db
      .update(wearableConnections)
      .set({ lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncMessage: message })
      .where(eq(wearableConnections.id, conn.id));
    return { ok: false, message };
  }
}

export async function disconnectOura() {
  const user = await requireUser();
  await db
    .delete(wearableConnections)
    .where(and(eq(wearableConnections.userId, user.id), eq(wearableConnections.source, "oura")));
  revalidatePath("/recovery");
}

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Manual daily entry — always available, no third party needed. */
export async function saveManualRecovery(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "") || todayInTz(user.timezone);

  const values = {
    sleepHours: numOrNull(formData.get("sleepHours")),
    sleepScore: numOrNull(formData.get("sleepScore")),
    restingHr: numOrNull(formData.get("restingHr")),
    hrvMs: numOrNull(formData.get("hrvMs")),
    readiness: numOrNull(formData.get("readiness")),
    steps: numOrNull(formData.get("steps")),
    activeKcal: numOrNull(formData.get("activeKcal")),
  };

  await db
    .insert(recoveryMetrics)
    .values({ userId: user.id, date, source: "manual", ...values })
    .onConflictDoUpdate({
      target: [recoveryMetrics.userId, recoveryMetrics.date, recoveryMetrics.source],
      set: { ...values, updatedAt: new Date() },
    });

  revalidatePath("/recovery");
  revalidatePath("/");
}

/** Create or rotate the personal ingest token used by the webhook. */
export async function regenerateIngestToken(): Promise<string> {
  const user = await requireUser();
  const token = randomBytes(24).toString("base64url");
  await db.update(users).set({ ingestToken: token }).where(eq(users.id, user.id));
  revalidatePath("/recovery");
  return token;
}
