import { and, desc, eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { db } from "@/db";
import { bodyMetrics } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import TrendChart from "@/components/charts/TrendChart";
import { requireUser } from "@/lib/auth";
import { prettyDate, shortDate, todayInTz } from "@/lib/dates";
import { kgToDisplay, round } from "@/lib/units";
import { deleteBodyMetric, saveBodyMetric } from "./actions";

export const dynamic = "force-dynamic";

export default async function BodyPage() {
  const user = await requireUser();
  const today = todayInTz(user.timezone);

  const entries = await db
    .select()
    .from(bodyMetrics)
    .where(eq(bodyMetrics.userId, user.id))
    .orderBy(desc(bodyMetrics.date))
    .limit(120);

  const [todayEntry] = await db
    .select()
    .from(bodyMetrics)
    .where(and(eq(bodyMetrics.userId, user.id), eq(bodyMetrics.date, today)))
    .limit(1);

  const chartData = [...entries]
    .reverse()
    .filter((e) => e.weightKg != null)
    .map((e) => ({
      label: shortDate(e.date),
      weight: round(kgToDisplay(e.weightKg, user.unit) ?? 0, 1),
      waist: e.waistCm ?? null,
    }));

  return (
    <>
      <PageHeader title="Body" subtitle="Weight, body fat and measurements" back="/more" />

      <form action={saveBodyMetric} className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="date">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              className="input"
              defaultValue={today}
              max={today}
            />
          </div>
          <div>
            <label className="label" htmlFor="weight">
              Weight ({user.unit})
            </label>
            <input
              id="weight"
              name="weight"
              type="number"
              step="0.1"
              inputMode="decimal"
              className="input tabular-nums"
              defaultValue={
                todayEntry?.weightKg != null
                  ? round(kgToDisplay(todayEntry.weightKg, user.unit) ?? 0, 1)
                  : ""
              }
              placeholder="75.4"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Field id="bodyFat" label="Body fat %" value={todayEntry?.bodyFatPct} />
          <Field id="waist" label="Waist cm" value={todayEntry?.waistCm} />
          <Field id="chest" label="Chest cm" value={todayEntry?.chestCm} />
          <Field id="arm" label="Arm cm" value={todayEntry?.armCm} />
          <Field id="thigh" label="Thigh cm" value={todayEntry?.thighCm} />
        </div>

        <div>
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <input
            id="notes"
            name="notes"
            className="input"
            defaultValue={todayEntry?.notes ?? ""}
            placeholder="Fasted, morning, after the bathroom…"
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          Save measurement
        </button>
      </form>

      {chartData.length > 1 && (
        <div className="mt-4">
          <TrendChart
            title="Body weight"
            subtitle={`Last ${chartData.length} weigh-ins`}
            data={chartData}
            suffix={` ${user.unit}`}
            series={[{ key: "weight", label: `Weight (${user.unit})`, color: "var(--series-1)" }]}
          />
        </div>
      )}

      <h2 className="h-section mb-2 mt-6">History</h2>
      {entries.length === 0 ? (
        <Empty title="Nothing logged yet" hint="Weigh yourself at the same time each day — usually first thing in the morning." />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular-nums">
                  {e.weightKg != null
                    ? `${round(kgToDisplay(e.weightKg, user.unit) ?? 0, 1)} ${user.unit}`
                    : "—"}
                  {e.bodyFatPct != null && (
                    <span className="ml-2 text-sm font-normal text-muted">
                      {e.bodyFatPct}% fat
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {prettyDate(e.date)}
                  {e.waistCm != null && ` · waist ${e.waistCm}cm`}
                  {e.armCm != null && ` · arm ${e.armCm}cm`}
                </p>
              </div>
              <form
                action={async () => {
                  "use server";
                  await deleteBodyMetric(e.id);
                }}
              >
                <button type="submit" aria-label="Delete entry" className="text-muted">
                  <Trash2 size={16} />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Field({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value?: number | null;
}) {
  return (
    <div>
      <label className="label !text-[10px]" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="number"
        step="0.1"
        inputMode="decimal"
        className="input px-2 text-center tabular-nums"
        defaultValue={value ?? ""}
        placeholder="—"
      />
    </div>
  );
}
