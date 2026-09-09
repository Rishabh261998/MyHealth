import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pushConfigured, sendPushToUser } from "@/lib/push";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!pushConfigured()) {
    return NextResponse.json(
      { error: "Push is not configured on the server (missing VAPID keys)." },
      { status: 400 },
    );
  }

  const result = await sendPushToUser(user.id, {
    title: "MyHealth is set up ✅",
    body: "Reminders will arrive here from now on.",
    url: "/",
    tag: "test",
  });

  return NextResponse.json(result);
}
