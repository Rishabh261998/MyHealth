import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bodyMetrics, meals, reminders, users, workouts } from "@/db/schema";
import {
  dowInTz,
  startOfWeekStr,
  timeInTz,
  todayInTz,
} from "@/lib/dates";
import { getPlannedSession } from "@/lib/queries";
import { pushConfigured, sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reminders fire if their time landed in the last WINDOW minutes. */
const WINDOW_MINUTES = 45;

function minutesOfDay(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 400 });
  }

  const allUsers = await db.select().from(users);
  const report: {
    user: number;
    localTime: string;
    delivered: string[];
    noDevices: string[];
    skipped: string[];
  }[] = [];

  for (const user of allUsers) {
    const tz = user.timezone || "UTC";
    const today = todayInTz(tz);
    const dow = dowInTz(tz);
    const nowMin = minutesOfDay(timeInTz(tz, new Date()));

    const due = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, user.id), eq(reminders.enabled, true)));

    const delivered: string[] = [];
    const noDevices: string[] = [];
    const skipped: string[] = [];

    for (const reminder of due) {
      const days = reminder.days.split(",").map((d) => Number(d.trim()));
      if (!days.includes(dow)) continue;
      if (reminder.lastSentDate === today) continue;

      const delta = nowMin - minutesOfDay(reminder.timeLocal);
      if (delta < 0 || delta > WINDOW_MINUTES) continue;

      const message = await buildMessage(user, reminder, today);
      if (!message) {
        // Nothing worth saying (e.g. the workout is already done) — mark it
        // handled so we don't reconsider it every run today.
        await db
          .update(reminders)
          .set({ lastSentDate: today })
          .where(eq(reminders.id, reminder.id));
        skipped.push(reminder.title);
        continue;
      }

      const result = await sendPushToUser(user.id, message);
      await db
        .update(reminders)
        .set({ lastSentDate: today })
        .where(eq(reminders.id, reminder.id));

      if (result.sent > 0) delivered.push(reminder.title);
      else noDevices.push(reminder.title);
    }

    if (delivered.length || noDevices.length || skipped.length) {
      report.push({
        user: user.id,
        localTime: `${today} ${timeInTz(tz)} (${tz})`,
        delivered,
        noDevices,
        skipped,
      });
    }
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), report });
}

type UserRow = typeof users.$inferSelect;
type ReminderRow = typeof reminders.$inferSelect;

/** Make each reminder say something specific rather than generic nagging. */
async function buildMessage(user: UserRow, reminder: ReminderRow, today: string) {
  const base = { title: reminder.title, body: reminder.body, url: reminder.url, tag: reminder.kind };

  if (reminder.kind === "gym") {
    const [logged] = await db
      .select({ finished: workouts.finished })
      .from(workouts)
      .where(and(eq(workouts.userId, user.id), eq(workouts.date, today)))
      .limit(1);
    if (logged?.finished) return null; // already trained — stay quiet

    const routine = await getPlannedSession(user.id, today);
    if (routine?.day.kind === "rest") return null;
    if (routine && routine.items.length > 0) {
      const names = routine.items.slice(0, 3).map((i) => i.name).join(", ");
      const more = routine.items.length > 3 ? ` +${routine.items.length - 3} more` : "";
      return {
        ...base,
        title: `${routine.day.label} today`,
        body: `${routine.items.length} exercises: ${names}${more}`,
      };
    }
    return base;
  }

  if (reminder.kind === "weigh_in") {
    const [existing] = await db
      .select({ id: bodyMetrics.id })
      .from(bodyMetrics)
      .where(
        and(
          eq(bodyMetrics.userId, user.id),
          eq(bodyMetrics.date, today),
          sql`${bodyMetrics.weightKg} is not null`,
        ),
      )
      .limit(1);
    return existing ? null : base;
  }

  if (reminder.kind === "junk_check" || reminder.kind === "meal") {
    const weekStart = startOfWeekStr(today);
    const [junk] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(meals)
      .where(
        and(eq(meals.userId, user.id), eq(meals.isJunk, true), gte(meals.date, weekStart)),
      );
    const limit = user.weeklyJunkLimit ?? 3;
    const count = junk?.n ?? 0;

    if (reminder.kind === "junk_check") {
      const [sessions] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(workouts)
        .where(and(eq(workouts.userId, user.id), gte(workouts.date, weekStart)));
      return {
        ...base,
        body: `${sessions?.n ?? 0} sessions and ${count} junk meals this week (limit ${limit}).`,
      };
    }

    if (count > limit) {
      return {
        ...base,
        title: "Watch the junk food",
        body: `${count} unhealthy meals this week against a limit of ${limit}. Make tomorrow a clean one.`,
      };
    }
    const [logged] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(meals)
      .where(and(eq(meals.userId, user.id), eq(meals.date, today)));
    return (logged?.n ?? 0) > 0 ? null : base;
  }

  return base;
}
