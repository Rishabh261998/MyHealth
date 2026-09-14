import "server-only";
import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, users, type User } from "@/db/schema";

export type Scope = "read" | "write";

const PREFIX_BYTES = 4; // 8 hex chars shown for identification
const SECRET_BYTES = 24;

export function hashKey(fullKey: string) {
  return createHash("sha256").update(fullKey).digest("hex");
}

/**
 * Mint a new key. Returns the plaintext ONCE (never stored) plus the row to
 * persist. Format: mh_<prefix>_<secret>.
 */
export function generateKey() {
  const prefixHex = randomBytes(PREFIX_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const prefix = `mh_${prefixHex}`;
  const fullKey = `${prefix}_${secret}`;
  return { fullKey, prefix, keyHash: hashKey(fullKey) };
}

function extractKey(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  const x = request.headers.get("x-api-key");
  return x?.trim() || null;
}

export type ApiAuth = { user: User; scopes: Scope[]; keyId: number };

/**
 * Authenticate a request by API key. Returns the owning user and the key's
 * scopes, or null. Updates last-used opportunistically. Revoked keys fail.
 */
export async function authenticateApiKey(request: Request): Promise<ApiAuth | null> {
  const key = extractKey(request);
  if (!key || !key.startsWith("mh_")) return null;

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) return null;

  // Best-effort; don't block the request on the write.
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {});

  const scopes = row.scopes.split(",").map((s) => s.trim()).filter(Boolean) as Scope[];
  return { user, scopes, keyId: row.id };
}

export function hasScope(auth: ApiAuth, scope: Scope) {
  return auth.scopes.includes(scope);
}
