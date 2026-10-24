"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  CALC_LABELS,
  METRIC_SOURCES,
  RANGE_OPTIONS,
  sourceByKey,
  type MetricCalc,
  type MetricPeriod,
} from "@/lib/metric-sources";
import { createMetric } from "./actions";

const GROUPS = ["Body", "Nutrition", "Recovery", "Training"] as const;

function suggestName(sourceKey: string, period: MetricPeriod, calc: MetricCalc, exerciseName?: string) {
  const source = sourceByKey(sourceKey)!;
  if (source.needsExercise) return exerciseName ? `${exerciseName}, est. 1RM` : "Est. 1RM";
  if (period === "day") return `Daily ${source.label.toLowerCase()}`;
  return `${source.label}, weekly ${CALC_LABELS[calc].toLowerCase()}`;
}

export default function MetricBuilder({
  lifts,
  startOpen,
}: {
  lifts: { id: number; name: string }[];
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [sourceKey, setSourceKey] = useState("body_weight");
  const [exerciseId, setExerciseId] = useState<number | null>(lifts[0]?.id ?? null);
  const [period, setPeriod] = useState<MetricPeriod>("week");
  const [calc, setCalc] = useState<MetricCalc>("avg");
  const [rangeDays, setRangeDays] = useState(90);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const source = sourceByKey(sourceKey)!;
  const exerciseName = lifts.find((l) => l.id === exerciseId)?.name;
  const shownName = nameEdited ? name : suggestName(sourceKey, period, calc, exerciseName);

  function chooseSource(key: string) {
    const next = sourceByKey(key)!;
    setSourceKey(key);
    setCalc(next.calcs[0]);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMetric({
        name: shownName,
        source: sourceKey,
        exerciseId: source.needsExercise ? exerciseId : null,
        period,
        calc: period === "day" ? source.calcs[0] : calc,
        rangeDays,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setName("");
      setNameEdited(false);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary w-full">
        <Plus size={16} /> New metric
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">New metric</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="rounded-lg p-1 text-muted"
        >
          <X size={18} />
        </button>
      </div>

      <div>
        <label htmlFor="metric-source" className="label">
          What to track
        </label>
        <select
          id="metric-source"
          className="input"
          value={sourceKey}
          onChange={(e) => chooseSource(e.target.value)}
        >
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {METRIC_SOURCES.filter((s) => s.group === g).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {source.needsExercise && (
        <div>
          <label htmlFor="metric-exercise" className="label">
            Exercise
          </label>
          {lifts.length > 0 ? (
            <select
              id="metric-exercise"
              className="input"
              value={exerciseId ?? ""}
              onChange={(e) => setExerciseId(Number(e.target.value))}
            >
              {lifts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted">Log a lift with weight and reps first.</p>
          )}
        </div>
      )}

      <fieldset>
        <legend className="label">Group by</legend>
        <Segmented
          value={period}
          onChange={(v) => setPeriod(v as MetricPeriod)}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
          ]}
        />
      </fieldset>

      {period === "week" && source.calcs.length > 1 && (
        <fieldset>
          <legend className="label">Combine the days by</legend>
          <Segmented
            value={calc}
            onChange={(v) => setCalc(v as MetricCalc)}
            options={source.calcs.map((c) => ({ value: c, label: CALC_LABELS[c] }))}
          />
        </fieldset>
      )}

      <div>
        <label htmlFor="metric-range" className="label">
          Time range
        </label>
        <select
          id="metric-range"
          className="input"
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value))}
        >
          {RANGE_OPTIONS.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="metric-name" className="label">
          Name
        </label>
        <input
          id="metric-name"
          className="input"
          value={shownName}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setNameEdited(true);
          }}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--bad)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={pending || (source.needsExercise && !exerciseId)}
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add metric
      </button>
    </form>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl border px-3 py-2 text-center text-sm font-medium ${
            o.value === value
              ? "border-brand bg-[var(--brand-soft)] text-brand"
              : "border-line bg-surface text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
