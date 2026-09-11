import "server-only";
import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

// No ambiguous characters (0/O, 1/I/L) — codes get read aloud and typed on phones.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Return the user's share code, generating and storing one on first use. */
export async function ensureShareCode(userId: number): Promise<string> {
  const [existing] = await db
    .select({ shareCode: users.shareCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing?.shareCode) return existing.shareCode;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    try {
      await db.update(users).set({ shareCode: code }).where(eq(users.id, userId));
      return code;
    } catch {
      // Unique-constraint collision — vanishingly rare, just try another.
    }
  }
  throw new Error("Could not allocate a share code. Please try again.");
}

export function normalizeShareCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}


/** The user's wearable ingest token, generated and stored on first use. */
export async function ensureIngestToken(userId: number): Promise<string> {
  const [existing] = await db
    .select({ ingestToken: users.ingestToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing?.ingestToken) return existing.ingestToken;

  const { randomBytes } = await import("crypto");
  const token = randomBytes(24).toString("base64url");
  await db.update(users).set({ ingestToken: token }).where(eq(users.id, userId));
  return token;
}
