"use client";

import { useOptimistic, useTransition } from "react";
import { Droplets, Minus, Plus } from "lucide-react";
import { addWater } from "@/app/(app)/nutrition/actions";

export default function QuickWater({
  date,
  current,
  goal,
}: {
  date: string;
  current: number;
  goal: number;
}) {
  const [, startTransition] = useTransition();
  const [ml, setMl] = useOptimistic(current, (_state, next: number) => next);

  const bump = (delta: number) => {
    startTransition(async () => {
      setMl(Math.max(0, ml + delta));
      await addWater(date, delta);
    });
  };

  const pct = Math.min(100, goal > 0 ? (ml / goal) * 100 : 0);

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets size={18} className="text-brand" />
          <span className="font-semibold">Water</span>
        </div>
        <span className="text-sm tabular-nums text-muted">
          {(ml / 1000).toFixed(1)} / {(goal / 1000).toFixed(1)} L
        </span>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface2"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Water intake progress"
      >
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => bump(250)} className="btn-ghost h-9 flex-1 text-xs">
          <Plus size={14} /> 250 ml
        </button>
        <button type="button" onClick={() => bump(500)} className="btn-ghost h-9 flex-1 text-xs">
          <Plus size={14} /> 500 ml
        </button>
        <button
          type="button"
          onClick={() => bump(-250)}
          className="btn-ghost h-9 px-3 text-xs"
          aria-label="Remove 250 ml"
        >
          <Minus size={14} />
        </button>
      </div>
    </section>
  );
}
