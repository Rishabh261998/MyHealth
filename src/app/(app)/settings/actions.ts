"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reminders, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { displayToKg } from "@/lib/units";

const int = (v: FormDataEntryValue | null, fallback: number) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
};

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const unit = z.enum(["kg", "lb"]).catch("kg").parse(String(formData.get("unit")));

  const rawTarget = String(formData.get("targetWeight") ?? "").trim();
  const targetWeightKg =
    rawTarget === "" ? null : displayToKg(Number(rawTarget), unit);

  await db
    .update(users)
    .set({
      name: String(formData.get("name") ?? "").trim(),
      timezone: String(formData.get("timezone") ?? "").trim() || user.timezone,
      unit,
      targetWeightKg,
      dailyCalories: int(formData.get("dailyCalories"), 2200),
      dailyProteinG: int(formData.get("dailyProtein"), 140),
      dailyWaterMl: int(formData.get("dailyWater"), 3000),
      weeklyJunkLimit: int(formData.get("junkLimit"), 3),
    })
    .where(eq(users.id, user.id));

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/nutrition");
}

export async function upsertReminder(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id")) || null;

  const days = ["0", "1", "2", "3", "4", "5", "6"]
    .filter((d) => formData.get(`day-${d}`) === "on")
    .join(",");

  const values = {
    kind: String(formData.get("kind") ?? "custom"),
    title: String(formData.get("title") ?? "").trim() || "Reminder",
    body: String(formData.get("body") ?? "").trim(),
    timeLocal: String(formData.get("timeLocal") ?? "18:00"),
    days: days || "0,1,2,3,4,5,6",
    url: String(formData.get("url") ?? "/").trim() || "/",
    enabled: formData.get("enabled") === "on",
  };

  if (id) {
    await db
      .update(reminders)
      .set(values)
      .where(and(eq(reminders.id, id), eq(reminders.userId, user.id)));
  } else {
    await db.insert(reminders).values({ userId: user.id, ...values });
  }

  revalidatePath("/settings");
}

export async function toggleReminder(id: number, enabled: boolean) {
  const user = await requireUser();
  await db
    .update(reminders)
    .set({ enabled })
    .where(and(eq(reminders.id, id), eq(reminders.userId, user.id)));
  revalidatePath("/settings");
}

export async function deleteReminder(id: number) {
  const user = await requireUser();
  await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, user.id)));
  revalidatePath("/settings");
}
