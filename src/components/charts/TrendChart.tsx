"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Chart, { AXIS, ChartTooltip } from "./Chart";

export type TrendSeries = { key: string; label: string; color: string };

export default function TrendChart({
  title,
  subtitle,
  data,
  series,
  suffix = "",
  xKey = "label",
  height = 220,
}: {
  title: string;
  subtitle?: string;
  data: Record<string, string | number | null>[];
  series: TrendSeries[];
  suffix?: string;
  xKey?: string;
  height?: number;
}) {
  const table = {
    columns: ["Date", ...series.map((s) => s.label)],
    rows: data.map((d) => [
      String(d[xKey] ?? ""),
      ...series.map((s) => {
        const v = d[s.key];
        return typeof v === "number" ? Math.round(v * 10) / 10 : "—";
      }),
    ]),
  };

  return (
    <Chart
      title={title}
      subtitle={subtitle}
      legend={series.map((s) => ({ label: s.label, color: s.color }))}
      table={table}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey={xKey} {...AXIS} minTickGap={24} />
          <YAxis {...AXIS} width={46} domain={["auto", "auto"]} />
          <Tooltip
            content={<ChartTooltip suffix={suffix} />}
            cursor={{ stroke: "var(--grid)", strokeWidth: 2 }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Chart>
  );
}
