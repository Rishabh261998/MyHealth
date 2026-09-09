"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";

const int = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export async function addNote(formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await db.insert(notes).values({
    userId: user.id,
    date: String(formData.get("date") ?? "") || todayInTz(user.timezone),
    title: String(formData.get("title") ?? "").trim(),
    body,
    mood: int(formData.get("mood")),
    energy: int(formData.get("energy")),
    sleepHours: (() => {
      const s = String(formData.get("sleep") ?? "").trim();
      const n = Number(s);
      return s === "" || !Number.isFinite(n) ? null : n;
    })(),
  });

  revalidatePath("/notes");
}

export async function deleteNote(id: number) {
  const user = await requireUser();
  await db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, user.id)));
  revalidatePath("/notes");
}
