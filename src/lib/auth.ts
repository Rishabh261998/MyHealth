import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

const scrypt = promisify(_scrypt) as (
  pw: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const COOKIE = "myhealth_session";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (needs 16+ characters).");
  }
  return new TextEncoder().encode(s);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  if (expected.length !== key.length) return false;
  return timingSafeEqual(key, expected);
}

export async function createSession(userId: number) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const uid = Number(payload.uid);
    if (!uid) return null;
    const rows = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Use in server components / actions that require a logged-in user. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Whether the sign-up form should be offered.
 *
 * ALLOW_SIGNUP=false closes registration — but the *first* account is always
 * allowed regardless. Closing sign-ups before creating your own account would
 * otherwise lock you out of your own deployment with no way back in.
 */
export async function signupAllowed(): Promise<boolean> {
  const closed = (process.env.ALLOW_SIGNUP ?? "true").trim().toLowerCase() === "false";
  if (!closed) return true;
  return (await countUsers()) === 0;
}

/** Number of registered accounts; -1 when the database cannot be reached. */
export async function countUsers(): Promise<number> {
  try {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    return row?.n ?? 0;
  } catch {
    return -1;
  }
}
