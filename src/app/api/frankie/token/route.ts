import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getCurrentUser } from "@/lib/auth";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * A short-lived token that tells Frankie (the in-app assistant) who the
 * signed-in user is. Signed with FRANKIE_JWT_SECRET, which stays server-side.
 */
export async function POST() {
  // Session first: a signed-out request is a 401 whether or not the secret is set.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: NO_STORE });

  const secret = process.env.FRANKIE_JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Frankie is not configured on this deployment." },
      { status: 503, headers: NO_STORE },
    );
  }

  // The secret's UTF-8 bytes exactly as set; it looks like base64 but is not decoded.
  const token = await new SignJWT({ name: user.name, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("300s")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token }, { headers: NO_STORE });
}
