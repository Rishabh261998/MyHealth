import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, users, type User } from "@/db/schema";

const scrypt = promisify(_scrypt) as (
  pw: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const COOKIE = "myhealth_session";

const SESSION_SECRET_KEY = "session_secret";

const globalForSecret = globalThis as unknown as { __authSecret?: Uint8Array };

/**
 * The key used to sign session cookies.
 *
 * AUTH_SECRET wins when it is set. Otherwise the server generates a random
 * secret once and keeps it in the database, so a deployment is secure without
 * anyone having to paste a random string into a settings screen. Either way the
 * value is stable across deploys, so sessions survive them.
 */
async function secret(): Promise<Uint8Array> {
  if (globalForSecret.__authSecret) return globalForSecret.__authSecret;

  const fromEnv = (process.env.AUTH_SECRET ?? "").trim();
  if (fromEnv.length >= 16) {
    const key = new TextEncoder().encode(fromEnv);
    globalForSecret.__authSecret = key;
    return key;
  }
  if (fromEnv.length > 0) {
    throw new Error("AUTH_SECRET is set but shorter than 16 characters.");
  }

  const generated = randomBytes(48).toString("base64url");

  // Two cold starts can race here, so let the database decide the winner:
  // insert only if absent, then read back whatever is actually stored.
  await db
    .insert(appSettings)
    .values({ key: SESSION_SECRET_KEY, value: generated })
    .onConflictDoNothing({ target: appSettings.key });

  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SESSION_SECRET_KEY))
    .limit(1);

  if (!row) {
    throw new Error("Could not establish a session secret in the database.");
  }

  const key = new TextEncoder().encode(row.value);
  globalForSecret.__authSecret = key;
  return key;
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
    .sign(await secret());

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
    const { payload } = await jwtVerify(token, await secret());
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
