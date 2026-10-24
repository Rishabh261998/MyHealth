"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Chart, { AXIS, ChartTooltip, formatTick } from "./Chart";

export default function BarsChart({
  title,
  subtitle,
  data,
  dataKey,
  label,
  suffix = "",
  height = 200,
  xLabel = "Week",
}: {
  title: string;
  subtitle?: string;
  data: { label: string; [k: string]: string | number }[];
  dataKey: string;
  label: string;
  suffix?: string;
  height?: number;
  /** Header for the first column of the table view. */
  xLabel?: string;
}) {
  return (
    <Chart
      title={title}
      subtitle={subtitle}
      table={{
        columns: [xLabel, label],
        rows: data.map((d) => [d.label, Math.round(Number(d[dataKey] ?? 0))]),
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={46} tickFormatter={formatTick} />
          <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar
            dataKey={dataKey}
            name={label}
            fill="var(--series-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={38}
          />
        </BarChart>
      </ResponsiveContainer>
    </Chart>
  );
}
