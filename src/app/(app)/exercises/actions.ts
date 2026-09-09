"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export async function createExercise(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const [existing] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.userId, user.id), eq(exercises.name, name)))
    .limit(1);

  if (existing) {
    await db.update(exercises).set({ archived: false }).where(eq(exercises.id, existing.id));
  } else {
    await db.insert(exercises).values({
      userId: user.id,
      name,
      muscleGroup: String(formData.get("muscleGroup") ?? "other").trim() || "other",
      kind: String(formData.get("kind") ?? "strength"),
      notes: String(formData.get("notes") ?? "").trim(),
    });
  }

  revalidatePath("/exercises");
  revalidatePath("/plan");
}

export async function toggleArchive(id: number, archived: boolean) {
  const user = await requireUser();
  await db
    .update(exercises)
    .set({ archived })
    .where(and(eq(exercises.id, id), eq(exercises.userId, user.id)));
  revalidatePath("/exercises");
  revalidatePath("/plan");
}
