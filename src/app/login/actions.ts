"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  destroySession,
  hashPassword,
  countUsers,
  signupAllowed,
  verifyPassword,
} from "@/lib/auth";
import { provisionNewUser } from "@/lib/provision";

const credentials = z.object({
  email: z.string().email("That does not look like an email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});

export type AuthState = { error?: string } | undefined;

/**
 * A failed query here almost always means the deployment is misconfigured
 * rather than that the user did anything wrong — so say that, and point at the
 * page that explains exactly which piece is missing.
 */
function configError(err: unknown): AuthState {
  console.error("[auth] database error:", err);
  return {
    error:
      "Could not reach the database. Open /api/health on this site to see which setting is missing.",
  };
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let user;
  try {
    [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
  } catch (err) {
    return configError(err);
  }

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    // Distinguish "no accounts at all" from "wrong password" — on a fresh
    // deployment the real answer is usually "you never signed up yet".
    if (!user && (await countUsers()) === 0) {
      return {
        error: "No account exists on this app yet. Use “Create your account” below first.",
      };
    }
    return { error: "Wrong email or password." };
  }

  await createSession(user.id);
  redirect("/");
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!(await signupAllowed())) {
    return { error: "Sign-ups are closed on this instance." };
  }

  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim() || "Asia/Kolkata";
  const unit = String(formData.get("unit") ?? "") === "kg" ? "kg" : "lb";

  let userId: number;
  try {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    if (existing) return { error: "An account with that email already exists." };

    const [created] = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        name,
        timezone,
        unit,
      })
      .returning({ id: users.id });

    userId = created.id;
    await provisionNewUser(userId);
  } catch (err) {
    return configError(err);
  }

  await createSession(userId);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
