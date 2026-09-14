"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { generateKey } from "@/lib/apikey";

export type CreateKeyState =
  | { fullKey: string; name: string }
  | { error: string }
  | undefined;

const MAX_KEYS = 20;

export async function createApiKey(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const user = await requireUser();

  const name = z
    .string()
    .trim()
    .min(1)
    .max(60)
    .catch("API key")
    .parse(String(formData.get("name") ?? ""));

  const canWrite = formData.get("write") === "on";
  const scopes = canWrite ? "read,write" : "read";

  const active = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_KEYS) {
    return { error: `You already have ${MAX_KEYS} active keys. Revoke one first.` };
  }

  const { fullKey, prefix, keyHash } = generateKey();
  await db.insert(apiKeys).values({ userId: user.id, name, prefix, keyHash, scopes });

  revalidatePath("/developer");
  // Returned once — the plaintext is never stored and cannot be shown again.
  return { fullKey, name };
}

export async function revokeApiKey(id: number) {
  const user = await requireUser();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)));
  revalidatePath("/developer");
}
