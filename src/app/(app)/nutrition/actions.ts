"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meals, waterLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
};

const mealSchema = z.object({
  name: z.string().min(1, "Give the meal a name.").max(200),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function addMeal(formData: FormData) {
  const user = await requireUser();
  const parsed = mealSchema.parse({
    name: String(formData.get("name") ?? "").trim(),
    slot: String(formData.get("slot") ?? "snack"),
    date: String(formData.get("date") ?? todayInTz(user.timezone)),
    time: String(formData.get("time") ?? "12:00"),
  });

  await db.insert(meals).values({
    userId: user.id,
    ...parsed,
    calories: num(formData.get("calories")),
    proteinG: num(formData.get("protein")),
    carbsG: num(formData.get("carbs")),
    fatG: num(formData.get("fat")),
    isJunk: formData.get("isJunk") === "on",
    notes: String(formData.get("notes") ?? "").trim(),
  });

  revalidatePath("/nutrition");
  revalidatePath("/");
}

export async function deleteMeal(id: number) {
  const user = await requireUser();
  await db.delete(meals).where(and(eq(meals.id, id), eq(meals.userId, user.id)));
  revalidatePath("/nutrition");
  revalidatePath("/");
}

export async function addWater(date: string, ml: number) {
  const user = await requireUser();
  await db
    .insert(waterLogs)
    .values({ userId: user.id, date, ml: Math.max(0, ml) })
    .onConflictDoUpdate({
      target: [waterLogs.userId, waterLogs.date],
      set: { ml: sql`greatest(0, ${waterLogs.ml} + ${ml})` },
    });
  revalidatePath("/nutrition");
  revalidatePath("/");
}
