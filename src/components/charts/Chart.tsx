"use client";

import { useState } from "react";
import { Table2, LineChart as LineIcon } from "lucide-react";

/**
 * Shared chart frame: title, optional legend, and a table view so the numbers
 * are always reachable without reading colour off the plot.
 */
export default function Chart({
  title,
  subtitle,
  legend,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: { label: string; color: string }[];
  table?: { columns: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <section className="card">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setView(view === "chart" ? "table" : "chart")}
            className="shrink-0 rounded-lg border border-line bg-surface2 p-1.5 text-muted"
            aria-label={view === "chart" ? "Show data as a table" : "Show the chart"}
          >
            {view === "chart" ? <Table2 size={15} /> : <LineIcon size={15} />}
          </button>
        )}
      </div>

      {legend && legend.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-3">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: l.color }}
                aria-hidden
              />
              {l.label}
            </li>
          ))}
        </ul>
      )}

      {view === "chart" ? (
        <div className="mt-2">{children}</div>
      ) : (
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                {table!.columns.map((c) => (
                  <th key={c} className="py-1.5 pr-3 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {table!.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="py-1.5 pr-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  suffix = "",
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}:{" "}
          <span className="tabular-nums text-ink">
            {typeof p.value === "number" ? Math.round(p.value * 10) / 10 : p.value}
            {suffix}
          </span>
        </p>
      ))}
    </div>
  );
}

export const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--axis-ink)", fontSize: 11 },
} as const;

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });

/** Y-axis tick labels short enough for the narrow axis: 10K, 7.5K, 7.23. */
export function formatTick(value: number | string) {
  return typeof value === "number" ? compact.format(value) : value;
}
