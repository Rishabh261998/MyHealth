"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Shuffle, X } from "lucide-react";
import { DAY_SHORT } from "@/lib/dates";
import { clearSwap, swapSession } from "./actions";

export type SwapOption = {
  id: number;
  label: string;
  kind: string;
  dayOfWeek: number;
  doneThisWeek: boolean;
};

/**
 * Lets you do a different session today without touching the weekly plan —
 * for when Monday's push day got missed and you want it on Wednesday.
 */
export default function SessionSwapper({
  date,
  currentRoutineDayId,
  options,
  swappedFromLabel,
}: {
  date: string;
  currentRoutineDayId: number | null;
  options: SwapOption[];
  swappedFromLabel: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const missed = options.filter((o) => !o.doneThisWeek && o.kind !== "rest");

  const choose = (routineDayId: number) => {
    setError("");
    startTransition(async () => {
      const result = await swapSession(date, routineDayId);
      if (!result.ok) setError(result.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  const reset = () => {
    setError("");
    startTransition(async () => {
      await clearSwap(date);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost h-9 text-xs"
          disabled={pending}
        >
          <Shuffle size={14} /> Do a different session
        </button>

        {swappedFromLabel && (
          <button
            type="button"
            onClick={reset}
            className="btn-ghost h-9 text-xs"
            disabled={pending}
          >
            <RotateCcw size={14} /> Back to {swappedFromLabel}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-[var(--bad)]">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5 sm:max-w-md sm:rounded-3xl sm:border">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Train something else today</h2>
                <p className="mt-0.5 text-sm text-muted">
                  Just for this date. Your weekly plan stays exactly as it is.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-lg border border-line bg-surface2 p-1.5 text-muted"
              >
                <X size={16} />
              </button>
            </div>

            {missed.length > 0 && (
              <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
                Not done this week:{" "}
                <span className="text-ink">{missed.map((m) => m.label).join(", ")}</span>
              </p>
            )}

            <ul className="mt-3 space-y-2">
              {options.map((option) => {
                const active = option.id === currentRoutineDayId;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => choose(option.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left disabled:opacity-60 ${
                        active
                          ? "border-brand bg-[var(--brand-soft)]"
                          : "border-line bg-surface2"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{option.label}</p>
                        <p className="text-xs text-muted">
                          normally {DAY_SHORT[option.dayOfWeek]}
                          {option.doneThisWeek
                            ? " · already done this week"
                            : option.kind === "rest"
                              ? ""
                              : " · not done this week"}
                        </p>
                      </div>
                      {active && <Check size={18} className="shrink-0 text-brand" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 text-center text-xs text-muted">
              Once you have logged sets for the day, swapping is blocked so the plan and your
              session cannot disagree — finish or delete that session first.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
