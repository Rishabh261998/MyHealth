import { and, asc, eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { db } from "@/db";
import { customMetrics, exercises, type CustomMetric } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import TrendChart from "@/components/charts/TrendChart";
import BarsChart from "@/components/charts/BarsChart";
import { requireUser } from "@/lib/auth";
import { shortDate, todayInTz } from "@/lib/dates";
import { computeMetric, type MetricSeries } from "@/lib/metrics";
import { CALC_LABELS, RANGE_OPTIONS, unitLabel, type MetricCalc } from "@/lib/metric-sources";
import { getPersonalRecords } from "@/lib/queries";
import MetricBuilder from "./MetricBuilder";
import { addStarterMetrics, deleteMetric } from "./actions";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const user = await requireUser();
  const today = todayInTz(user.timezone);

  const [saved, library, prs] = await Promise.all([
    db
      .select()
      .from(customMetrics)
      .where(eq(customMetrics.userId, user.id))
      .orderBy(asc(customMetrics.id)),
    db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(and(eq(exercises.userId, user.id), eq(exercises.archived, false)))
      .orderBy(asc(exercises.name)),
    getPersonalRecords(user.id),
  ]);

  const series = await Promise.all(
    saved.map((m) => computeMetric(m, user.id, today, user.unit)),
  );

  // Only lifts with logged sets have an estimated 1RM to chart.
  const lifts = library.filter((l) => prs.has(l.id));

  return (
    <>
      <PageHeader
        title="Metrics"
        subtitle="Build your own charts from what you log"
        back="/more"
      />

      <MetricBuilder lifts={lifts} startOpen={false} />

      {saved.length === 0 ? (
        <div className="mt-4">
          <Empty
            title="No metrics yet"
            hint="Pick what to track, group it by day or week, and see how it moves over time. Or start with a few common ones."
          >
            <form action={addStarterMetrics}>
              <button type="submit" className="btn-ghost mt-2 h-9 text-xs">
                Add starter metrics
              </button>
            </form>
          </Empty>
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {saved.map((metric, i) => (
            <li key={metric.id}>
              <MetricCard metric={metric} series={series[i]} unit={user.unit} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function MetricCard({
  metric,
  series,
  unit,
}: {
  metric: CustomMetric;
  series: MetricSeries | null;
  unit: string;
}) {
  const remove = (
    <form action={deleteMetric.bind(null, metric.id)}>
      <button
        type="submit"
        aria-label={`Delete ${metric.name}`}
        className="rounded-lg border border-line bg-surface2 p-1.5 text-muted"
      >
        <Trash2 size={15} />
      </button>
    </form>
  );

  if (!series) {
    return (
      <div className="card flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{metric.name}: this metric is no longer available.</p>
        {remove}
      </div>
    );
  }

  const { source, points, stats } = series;
  const u = unitLabel(source, unit);
  const calc = metric.calc as MetricCalc;
  const per = metric.period === "week" ? "week" : "day";
  const range = RANGE_OPTIONS.find((r) => r.days === metric.rangeDays)?.label ?? "";
  const subtitle =
    metric.period === "week"
      ? `${CALC_LABELS[calc]} per week (from Monday) · ${range.toLowerCase()} · ${u}`
      : `Per day · ${range.toLowerCase()} · ${u}`;
  const fmt = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("en-US")} ${u}`);
  const signed = (v: number | null) =>
    v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US")} ${u}`;

  // Totals and counts read as bars; levels and averages as a line.
  const asBars = calc === "sum" || source.zeroFill;
  const data = points.map((p) => ({ label: shortDate(p.date), value: p.value }));

  return (
    <section>
      {points.length === 0 ? (
        <div className="card">
          <h3 className="font-semibold">{metric.name}</h3>
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          <p className="mt-4 text-sm text-muted">Nothing logged for this in the time range yet.</p>
        </div>
      ) : asBars ? (
        <BarsChart
          title={metric.name}
          subtitle={subtitle}
          data={data}
          dataKey="value"
          label={metric.name}
          suffix={` ${u}`}
          xLabel={metric.period === "week" ? "Week of" : "Day"}
        />
      ) : (
        <TrendChart
          title={metric.name}
          subtitle={subtitle}
          data={data}
          suffix={` ${u}`}
          series={[{ key: "value", label: metric.name, color: "var(--series-1)" }]}
        />
      )}

      <div className="mt-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <span className="chip">
            Latest {per}: <span className="text-ink tabular-nums">{fmt(stats.latest)}</span>
          </span>
          <span className="chip">
            Average: <span className="text-ink tabular-nums">{fmt(stats.average)}</span>
          </span>
          {stats.total != null ? (
            <span className="chip">
              Total: <span className="text-ink tabular-nums">{fmt(stats.total)}</span>
            </span>
          ) : (
            <span className="chip">
              Change: <span className="text-ink tabular-nums">{signed(stats.change)}</span>
            </span>
          )}
        </div>
        {remove}
      </div>
    </section>
  );
}
