import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reminders } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { kgToDisplay, round } from "@/lib/units";
import { pushConfigured } from "@/lib/push";
import NotificationSettings from "./NotificationSettings";
import RemindersEditor from "./RemindersEditor";
import { updateProfile } from "./actions";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

export default async function SettingsPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, user.id))
    .orderBy(asc(reminders.timeLocal));

  const tzOptions = TIMEZONES.includes(user.timezone)
    ? TIMEZONES
    : [user.timezone, ...TIMEZONES];

  return (
    <>
      <PageHeader title="Settings" subtitle={user.email} back="/more" />

      <form action={updateProfile} className="card space-y-3">
        <h2 className="font-semibold">Profile &amp; goals</h2>

        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" className="input" defaultValue={user.name} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="unit">
              Weight unit
            </label>
            <select id="unit" name="unit" className="input" defaultValue={user.unit}>
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="timezone">
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              className="input"
              defaultValue={user.timezone}
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="targetWeight">
            Target weight ({user.unit})
          </label>
          <input
            id="targetWeight"
            name="targetWeight"
            type="number"
            step="0.1"
            inputMode="decimal"
            className="input tabular-nums"
            defaultValue={
              user.targetWeightKg != null
                ? round(kgToDisplay(user.targetWeightKg, user.unit) ?? 0, 1)
                : ""
            }
            placeholder="Optional"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Num id="dailyCalories" label="Daily calories" value={user.dailyCalories ?? 2200} />
          <Num id="dailyProtein" label="Daily protein (g)" value={user.dailyProteinG ?? 140} />
          <Num id="dailyWater" label="Daily water (ml)" value={user.dailyWaterMl ?? 3000} />
          <Num id="junkLimit" label="Junk meals / week" value={user.weeklyJunkLimit ?? 3} />
        </div>

        <button type="submit" className="btn-primary w-full">
          Save settings
        </button>
      </form>

      <div className="mt-4">
        <NotificationSettings configured={pushConfigured()} />
      </div>

      <div className="mt-4">
        <RemindersEditor
          reminders={rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            title: r.title,
            body: r.body,
            timeLocal: r.timeLocal,
            days: r.days,
            url: r.url,
            enabled: r.enabled,
          }))}
        />
      </div>
    </>
  );
}

function Num({ id, label, value }: { id: string; label: string; value: number }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="number"
        inputMode="numeric"
        className="input tabular-nums"
        defaultValue={value}
      />
    </div>
  );
}
