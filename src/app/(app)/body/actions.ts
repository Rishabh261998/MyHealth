"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bodyMetrics } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { displayToKg } from "@/lib/units";
import { todayInTz } from "@/lib/dates";

const f = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export async function saveBodyMetric(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "") || todayInTz(user.timezone);

  const values = {
    weightKg: displayToKg(f(formData.get("weight")), user.unit),
    bodyFatPct: f(formData.get("bodyFat")),
    waistCm: f(formData.get("waist")),
    chestCm: f(formData.get("chest")),
    armCm: f(formData.get("arm")),
    thighCm: f(formData.get("thigh")),
    notes: String(formData.get("notes") ?? "").trim(),
  };

  await db
    .insert(bodyMetrics)
    .values({ userId: user.id, date, ...values })
    .onConflictDoUpdate({
      target: [bodyMetrics.userId, bodyMetrics.date],
      set: values,
    });

  revalidatePath("/body");
  revalidatePath("/progress");
  revalidatePath("/");
}

export async function deleteBodyMetric(id: number) {
  const user = await requireUser();
  await db
    .delete(bodyMetrics)
    .where(and(eq(bodyMetrics.id, id), eq(bodyMetrics.userId, user.id)));
  revalidatePath("/body");
  revalidatePath("/progress");
  revalidatePath("/");
}
