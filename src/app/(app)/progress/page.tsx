import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import Stat from "@/components/Stat";
import TrendChart from "@/components/charts/TrendChart";
import BarsChart from "@/components/charts/BarsChart";
import { requireUser } from "@/lib/auth";
import { addDaysStr, shortDate, todayInTz } from "@/lib/dates";
import {
  getBodyWeightSeries,
  getExerciseHistory,
  getPersonalRecords,
  getWeeklyVolume,
} from "@/lib/queries";
import { kgToDisplay, round } from "@/lib/units";
import ExercisePickerNav from "./ExercisePickerNav";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "30", label: "30d", days: 30 },
  { key: "90", label: "3m", days: 90 },
  { key: "365", label: "1y", days: 365 },
  { key: "all", label: "All", days: 100000 },
];

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ ex?: string; range?: string }>;
}) {
  const user = await requireUser();
  const { ex, range } = await searchParams;
  const today = todayInTz(user.timezone);
  const activeRange = RANGES.find((r) => r.key === range) ?? RANGES[2];
  const since = activeRange.days > 9999 ? undefined : addDaysStr(today, -activeRange.days);

  const library = await db
    .select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup })
    .from(exercises)
    .where(and(eq(exercises.userId, user.id), eq(exercises.archived, false)))
    .orderBy(asc(exercises.name));

  const prs = await getPersonalRecords(user.id);
  const trackable = library.filter((l) => prs.has(l.id));
  const selectedId = Number(ex) || trackable[0]?.id || null;

  const [weights, volume, history] = await Promise.all([
    getBodyWeightSeries(user.id, since),
    getWeeklyVolume(user.id, activeRange.days > 9999 ? 104 : Math.ceil(activeRange.days / 7)),
    selectedId ? getExerciseHistory(user.id, selectedId) : Promise.resolve([]),
  ]);

  const weightData = weights
    .filter((w) => w.weightKg != null)
    .map((w) => ({
      label: shortDate(w.date),
      date: w.date,
      weight: round(kgToDisplay(w.weightKg, user.unit) ?? 0, 1),
    }));

  const first = weightData[0]?.weight ?? null;
  const last = weightData.at(-1)?.weight ?? null;
  const weightChange = first != null && last != null ? round(last - first, 1) : null;

  const filteredHistory = since ? history.filter((h) => h.date >= since) : history;
  const strengthData = filteredHistory.map((h) => ({
    label: shortDate(h.date),
    top: round(kgToDisplay(h.top_weight, user.unit) ?? 0, 1),
    e1rm: round(kgToDisplay(h.best_1rm, user.unit) ?? 0, 1),
  }));

  const strengthChange =
    strengthData.length > 1
      ? round(strengthData.at(-1)!.e1rm - strengthData[0].e1rm, 1)
      : null;

  const volumeData = volume.map((v) => ({
    label: shortDate(v.week),
    volume: round(kgToDisplay(Number(v.volume), user.unit) ?? 0, 0),
    sessions: v.sessions,
  }));

  const selectedName = library.find((l) => l.id === selectedId)?.name ?? "";

  return (
    <>
      <PageHeader title="Progress" subtitle="Are the numbers going the right way?" />

      <nav className="mb-4 flex gap-1.5" aria-label="Time range">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/progress?range=${r.key}${selectedId ? `&ex=${selectedId}` : ""}`}
            className={`flex-1 rounded-xl border px-3 py-2 text-center text-sm font-medium ${
              r.key === activeRange.key
                ? "border-brand bg-[var(--brand-soft)] text-brand"
                : "border-line bg-surface text-muted"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat
          label="Weight change"
          value={
            weightChange == null
              ? "—"
              : `${weightChange > 0 ? "+" : ""}${weightChange} ${user.unit}`
          }
          sub={`over ${activeRange.label}`}
          tone={
            weightChange == null || user.targetWeightKg == null
              ? "default"
              : movingTowardTarget(weightChange, last, kgToDisplay(user.targetWeightKg, user.unit))
                ? "good"
                : "warn"
          }
        />
        <Stat
          label="Strength change"
          value={
            strengthChange == null
              ? "—"
              : `${strengthChange > 0 ? "+" : ""}${strengthChange} ${user.unit}`
          }
          sub={selectedName ? `est. 1RM · ${selectedName}` : "log some sets first"}
          tone={strengthChange != null && strengthChange > 0 ? "good" : "default"}
        />
      </div>

      {/* ------------------------------------------------------ body weight */}
      {weightData.length > 1 ? (
        <TrendChart
          title="Body weight"
          subtitle={`${weightData.length} weigh-ins · ${user.unit}`}
          data={weightData}
          suffix={` ${user.unit}`}
          series={[{ key: "weight", label: `Weight (${user.unit})`, color: "var(--series-1)" }]}
        />
      ) : (
        <Empty
          title="Not enough weigh-ins yet"
          hint="Log your weight on two different days and the trend line appears here."
        >
          <Link href="/body" className="btn-primary mt-2 h-9 text-xs">
            Log weight
          </Link>
        </Empty>
      )}

      {/* -------------------------------------------------------- strength */}
      <div className="mt-4">
        {trackable.length > 0 ? (
          <>
            <ExercisePickerNav
              exercises={trackable}
              selectedId={selectedId}
              range={activeRange.key}
            />
            {strengthData.length > 1 ? (
              <div className="mt-3">
                <TrendChart
                  title={selectedName}
                  subtitle="Heaviest set and estimated one-rep max per session"
                  data={strengthData}
                  suffix={` ${user.unit}`}
                  series={[
                    { key: "top", label: "Top set", color: "var(--series-1)" },
                    { key: "e1rm", label: "Est. 1RM", color: "var(--series-2)" },
                  ]}
                />
              </div>
            ) : (
              <div className="mt-3">
                <Empty
                  title={`Only one session logged for ${selectedName}`}
                  hint="Log it once more and you will see whether the weight is going up."
                />
              </div>
            )}
          </>
        ) : (
          <Empty
            title="No lifts logged yet"
            hint="Finish a workout with weights and reps, and your strength curve starts here."
          />
        )}
      </div>

      {/* ---------------------------------------------------------- volume */}
      {volumeData.length > 0 && (
        <div className="mt-4">
          <BarsChart
            title="Weekly training volume"
            subtitle={`Total weight moved per week (${user.unit})`}
            data={volumeData}
            dataKey="volume"
            label={`Volume (${user.unit})`}
            suffix={` ${user.unit}`}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- PRs */}
      {trackable.length > 0 && (
        <section className="card mt-4">
          <h3 className="font-semibold">Personal records</h3>
          <p className="mt-0.5 text-xs text-muted">Best estimated 1RM for each lift.</p>
          <ul className="mt-3 divide-y divide-line">
            {trackable
              .map((l) => ({ ...l, pr: prs.get(l.id)! }))
              .sort((a, b) => b.pr.best1rm - a.pr.best1rm)
              .map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/progress?ex=${l.id}&range=${activeRange.key}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                  >
                    {l.name}
                  </Link>
                  <span className="text-sm tabular-nums text-muted">
                    {round(kgToDisplay(l.pr.topWeight, user.unit) ?? 0)} {user.unit}
                    <span className="ml-2 text-xs">
                      (1RM {round(kgToDisplay(l.pr.best1rm, user.unit) ?? 0)})
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <Link
        href="/metrics"
        className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5"
      >
        <span className="font-medium">Build your own metrics</span>
        <span className="text-muted">→</span>
      </Link>

      <Link
        href="/photos"
        className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5"
      >
        <span className="font-medium">Compare progress photos</span>
        <span className="text-muted">→</span>
      </Link>
    </>
  );
}

function movingTowardTarget(
  change: number,
  current: number | null,
  target: number | null,
) {
  if (current == null || target == null) return false;
  return target > current ? change > 0 : change < 0;
}
