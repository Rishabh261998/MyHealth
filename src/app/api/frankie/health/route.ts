import { NextResponse, connection } from "next/server";
import { createHash } from "node:crypto";

/**
 * What Frankie's dashboard checks to confirm the install. Reports only whether
 * each setting is present, plus a short fingerprint of the secret so a
 * mismatch can be spotted; never the secret itself.
 */
export async function GET() {
  await connection();

  const secret = process.env.FRANKIE_JWT_SECRET;

  return NextResponse.json(
    {
      frankie: true,
      publishableKey: Boolean(process.env.NEXT_PUBLIC_FRANKIE_KEY),
      agents: {
        support: Boolean(process.env.NEXT_PUBLIC_FRANKIE_KEY_SUPPORT),
        docs: Boolean(process.env.NEXT_PUBLIC_FRANKIE_KEY_DOCS),
      },
      jwtSecret: Boolean(secret),
      jwtSecretFingerprint: secret
        ? createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 8)
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
