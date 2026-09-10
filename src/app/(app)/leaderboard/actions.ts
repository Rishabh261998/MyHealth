"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { friendships, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureShareCode, normalizeShareCode } from "@/lib/sharecode";

export type FriendActionState = { error?: string; ok?: string } | undefined;

/** Add a friend by their share code — writes both directions so it is mutual. */
export async function addFriend(
  _prev: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  const me = await requireUser();
  const code = normalizeShareCode(String(formData.get("code") ?? ""));

  if (code.length < 4) return { error: "Enter your friend's full code." };

  const myCode = await ensureShareCode(me.id);
  if (code === myCode) return { error: "That is your own code — share it with a friend instead." };

  const [friend] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.shareCode, code))
    .limit(1);

  if (!friend) return { error: "No one has that code. Double-check it with your friend." };

  const [existing] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.userId, me.id), eq(friendships.friendId, friend.id)))
    .limit(1);
  if (existing) return { ok: `You are already connected with ${friend.name || "them"}.` };

  await db
    .insert(friendships)
    .values([
      { userId: me.id, friendId: friend.id },
      { userId: friend.id, friendId: me.id },
    ])
    .onConflictDoNothing();

  revalidatePath("/leaderboard");
  return { ok: `Connected with ${friend.name || "your friend"}.` };
}

export async function removeFriend(friendId: number) {
  const me = await requireUser();
  // Drop both directions.
  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.userId, me.id), eq(friendships.friendId, friendId)),
        and(eq(friendships.userId, friendId), eq(friendships.friendId, me.id)),
      ),
    );
  revalidatePath("/leaderboard");
}

export async function setPublicLeaderboard(optIn: boolean) {
  const me = await requireUser();
  await db.update(users).set({ publicLeaderboard: optIn }).where(eq(users.id, me.id));
  revalidatePath("/leaderboard");
  revalidatePath("/settings");
}
