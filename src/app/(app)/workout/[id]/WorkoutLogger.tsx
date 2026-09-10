"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Flame,
  Plus,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import RestTimer from "@/components/RestTimer";
import { deleteWorkout, saveWorkout } from "../actions";
import { displayToKg, estimate1rm, kgToDisplay, round } from "@/lib/units";
import { prettyDate } from "@/lib/dates";
import type { LastPerformance } from "@/lib/queries";

type SetRow = {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  isWarmup: boolean;
  done: boolean;
};

type Entry = {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  kind: string;
  position: number;
  sets: SetRow[];
};

type LibraryItem = { id: number; name: string; muscleGroup: string; kind: string };

export default function WorkoutLogger({
  workout,
  initialEntries,
  library,
  unit,
  lastPerformances,
  personalRecords,
}: {
  workout: {
    id: number;
    date: string;
    label: string;
    kind: string;
    notes: string;
    durationMin: number | null;
    distanceKm: number | null;
    finished: boolean;
  };
  initialEntries: Entry[];
  library: LibraryItem[];
  unit: string;
  lastPerformances: Record<string, LastPerformance>;
  personalRecords: Record<string, { best1rm: number; topWeight: number }>;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [notes, setNotes] = useState(workout.notes);
  const [duration, setDuration] = useState<string>(workout.durationMin?.toString() ?? "");
  const [distance, setDistance] = useState<string>(workout.distanceKm?.toString() ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showPicker, setShowPicker] = useState(false);
  const [, startTransition] = useTransition();
  const dirty = useRef(false);
  const isCardio = workout.kind === "cardio";

  const persist = useCallback(
    async (finished?: boolean) => {
      setStatus("saving");
      await saveWorkout({
        workoutId: workout.id,
        notes,
        durationMin: duration === "" ? null : Number(duration),
        distanceKm: distance === "" ? null : Number(distance),
        ...(finished === undefined ? {} : { finished }),
        entries: entries.map((e, i) => ({
          exerciseId: e.exerciseId,
          position: i,
          sets: e.sets.map((s, j) => ({ ...s, setNumber: j + 1 })),
        })),
      });
      setStatus("saved");
    },
    [entries, notes, duration, distance, workout.id],
  );

  // Debounced autosave — nobody wants to remember to hit "save" mid-set.
  useEffect(() => {
    if (!dirty.current) return;
    setStatus("saving");
    const t = setTimeout(() => {
      persist().catch(() => setStatus("idle"));
    }, 1200);
    return () => clearTimeout(t);
  }, [entries, notes, duration, distance, persist]);

  const mutate = (fn: (draft: Entry[]) => Entry[]) => {
    dirty.current = true;
    setEntries((prev) => fn(structuredClone(prev)));
  };

  const updateSet = (exIdx: number, setIdx: number, patch: Partial<SetRow>) =>
    mutate((d) => {
      d[exIdx].sets[setIdx] = { ...d[exIdx].sets[setIdx], ...patch };
      return d;
    });

  const addSet = (exIdx: number) =>
    mutate((d) => {
      const sets = d[exIdx].sets;
      const last = sets[sets.length - 1];
      sets.push({
        setNumber: sets.length + 1,
        weightKg: last?.weightKg ?? null,
        reps: last?.reps ?? null,
        rpe: null,
        isWarmup: false,
        done: false,
      });
      return d;
    });

  const removeSet = (exIdx: number, setIdx: number) =>
    mutate((d) => {
      d[exIdx].sets.splice(setIdx, 1);
      return d;
    });

  const removeExercise = (exIdx: number) =>
    mutate((d) => {
      d.splice(exIdx, 1);
      return d;
    });

  const moveExercise = (exIdx: number, dir: -1 | 1) =>
    mutate((d) => {
      const target = exIdx + dir;
      if (target < 0 || target >= d.length) return d;
      [d[exIdx], d[target]] = [d[target], d[exIdx]];
      return d;
    });

  const addExercise = (item: LibraryItem) => {
    setShowPicker(false);
    mutate((d) => {
      if (d.some((e) => e.exerciseId === item.id)) return d;
      d.push({
        exerciseId: item.id,
        name: item.name,
        muscleGroup: item.muscleGroup,
        kind: item.kind,
        position: d.length,
        sets: [{ setNumber: 1, weightKg: null, reps: null, rpe: null, isWarmup: false, done: false }],
      });
      return d;
    });
  };

  const totals = useMemo(() => {
    let volume = 0;
    let sets = 0;
    for (const e of entries) {
      for (const s of e.sets) {
        if (s.done && !s.isWarmup && s.weightKg && s.reps) {
          volume += s.weightKg * s.reps;
          sets++;
        } else if (s.done) {
          sets++;
        }
      }
    }
    return { volume, sets };
  }, [entries]);

  const finish = () => {
    dirty.current = false;
    startTransition(async () => {
      await persist(true);
      router.push("/workout");
      router.refresh();
    });
  };

  return (
    <>
      <PageHeader
        title={workout.label}
        subtitle={`${prettyDate(workout.date)} · ${totals.sets} sets logged`}
        back="/workout"
        action={
          <span className="mt-1 text-xs text-muted">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
          </span>
        }
      />

      {isCardio && (
        <div className="card mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="distance">
              Distance (km)
            </label>
            <input
              id="distance"
              className="input"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={distance}
              onChange={(e) => {
                dirty.current = true;
                setDistance(e.target.value);
              }}
              placeholder="5.0"
            />
          </div>
          <div>
            <label className="label" htmlFor="duration">
              Time (min)
            </label>
            <input
              id="duration"
              className="input"
              type="number"
              inputMode="numeric"
              value={duration}
              onChange={(e) => {
                dirty.current = true;
                setDuration(e.target.value);
              }}
              placeholder="30"
            />
          </div>
          {Number(distance) > 0 && Number(duration) > 0 && (
            <p className="col-span-2 text-sm text-muted">
              Average pace{" "}
              <strong className="text-ink">
                {formatPace(Number(duration) / Number(distance))} / km
              </strong>
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {entries.map((entry, exIdx) => (
          <ExerciseBlock
            key={entry.exerciseId}
            entry={entry}
            unit={unit}
            last={lastPerformances[entry.exerciseId]}
            pr={personalRecords[entry.exerciseId]}
            isFirst={exIdx === 0}
            isLast={exIdx === entries.length - 1}
            onUpdateSet={(setIdx, patch) => updateSet(exIdx, setIdx, patch)}
            onAddSet={() => addSet(exIdx)}
            onRemoveSet={(setIdx) => removeSet(exIdx, setIdx)}
            onRemove={() => removeExercise(exIdx)}
            onMove={(dir) => moveExercise(exIdx, dir)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="btn-ghost mt-4 w-full"
      >
        <Plus size={18} /> Add exercise
      </button>

      <div className="card mt-4">
        <label className="label" htmlFor="notes">
          Session notes
        </label>
        <textarea
          id="notes"
          className="input min-h-[90px]"
          value={notes}
          onChange={(e) => {
            dirty.current = true;
            setNotes(e.target.value);
          }}
          placeholder="How did it feel? Anything to remember for next time?"
        />
        {!isCardio && (
          <div className="mt-3">
            <label className="label" htmlFor="dur">
              Duration (min)
            </label>
            <input
              id="dur"
              className="input"
              type="number"
              inputMode="numeric"
              value={duration}
              onChange={(e) => {
                dirty.current = true;
                setDuration(e.target.value);
              }}
              placeholder="60"
            />
          </div>
        )}
      </div>

      {totals.volume > 0 && (
        <p className="mt-3 text-center text-sm text-muted">
          Total volume{" "}
          <strong className="text-ink tabular-nums">
            {round(kgToDisplay(totals.volume, unit) ?? 0, 0).toLocaleString()} {unit}
          </strong>
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={finish} className="btn-primary flex-1">
          <Check size={18} /> {workout.finished ? "Save changes" : "Finish workout"}
        </button>
        <form
          action={async () => {
            await deleteWorkout(workout.id);
          }}
        >
          <button
            type="submit"
            className="btn-danger"
            aria-label="Delete this workout"
            onClick={(e) => {
              if (!confirm("Delete this whole session? This cannot be undone.")) {
                e.preventDefault();
              }
            }}
          >
            <Trash2 size={18} />
          </button>
        </form>
      </div>

      <RestTimer />

      {showPicker && (
        <ExercisePicker
          library={library.filter((l) => !entries.some((e) => e.exerciseId === l.id))}
          onPick={addExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ block */

function ExerciseBlock({
  entry,
  unit,
  last,
  pr,
  isFirst,
  isLast,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemove,
  onMove,
}: {
  entry: Entry;
  unit: string;
  last?: LastPerformance;
  pr?: { best1rm: number; topWeight: number };
  isFirst: boolean;
  isLast: boolean;
  onUpdateSet: (setIdx: number, patch: Partial<SetRow>) => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [menu, setMenu] = useState(false);

  const lastText = last
    ? last.sets
        .map((s) =>
          s.weightKg != null && s.reps != null
            ? `${round(kgToDisplay(s.weightKg, unit) ?? 0)}×${s.reps}`
            : "—",
        )
        .join("  ")
    : null;

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{entry.name}</h2>
          <p className="mt-0.5 text-xs capitalize text-muted">{entry.muscleGroup}</p>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="rounded-lg border border-line bg-surface2 p-1.5 text-muted"
            aria-label={`Options for ${entry.name}`}
          >
            <ChevronDown size={16} />
          </button>
          {menu && (
            <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-line bg-surface2 text-sm shadow-xl">
              {!isFirst && (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-surface"
                  onClick={() => {
                    onMove(-1);
                    setMenu(false);
                  }}
                >
                  Move up
                </button>
              )}
              {!isLast && (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-surface"
                  onClick={() => {
                    onMove(1);
                    setMenu(false);
                  }}
                >
                  Move down
                </button>
              )}
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[var(--bad)] hover:bg-surface"
                onClick={() => {
                  onRemove();
                  setMenu(false);
                }}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {lastText && (
        <p className="mt-2 rounded-lg bg-surface2 px-2.5 py-1.5 text-xs text-muted">
          Last time · <span className="tabular-nums text-ink">{lastText}</span>
        </p>
      )}

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span>Set</span>
          <span>{unit}</span>
          <span>Reps</span>
          <span />
        </div>

        {entry.sets.map((set, i) => {
          const suggestion = last?.sets[i];
          const e1rm =
            set.weightKg && set.reps ? estimate1rm(set.weightKg, set.reps) : 0;
          const isPr = !!pr && e1rm > 0 && e1rm > pr.best1rm + 0.01 && !set.isWarmup;

          return (
            <div
              key={i}
              className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2"
            >
              <button
                type="button"
                onClick={() => onUpdateSet(i, { isWarmup: !set.isWarmup })}
                title={set.isWarmup ? "Warm-up set — tap to make it a working set" : "Working set — tap to mark as warm-up"}
                className={`h-9 rounded-lg border border-line text-xs font-bold tabular-nums ${
                  set.isWarmup ? "bg-surface2 text-[var(--warn)]" : "bg-surface2 text-muted"
                }`}
              >
                {set.isWarmup ? "W" : i + 1}
              </button>

              <input
                className="input h-9 px-2 py-0 text-center tabular-nums"
                type="number"
                inputMode="decimal"
                step="any"
                value={
                  set.weightKg == null ? "" : String(round(kgToDisplay(set.weightKg, unit) ?? 0, 2))
                }
                placeholder={
                  suggestion?.weightKg != null
                    ? String(round(kgToDisplay(suggestion.weightKg, unit) ?? 0))
                    : "—"
                }
                onChange={(e) =>
                  onUpdateSet(i, {
                    weightKg:
                      e.target.value === ""
                        ? null
                        : displayToKg(Number(e.target.value), unit),
                  })
                }
              />

              <input
                className="input h-9 px-2 py-0 text-center tabular-nums"
                type="number"
                inputMode="numeric"
                value={set.reps == null ? "" : String(set.reps)}
                placeholder={suggestion?.reps != null ? String(suggestion.reps) : "—"}
                onChange={(e) =>
                  onUpdateSet(i, {
                    reps: e.target.value === "" ? null : Math.trunc(Number(e.target.value)),
                  })
                }
              />

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdateSet(i, { done: !set.done })}
                  aria-label={set.done ? "Mark set as not done" : "Mark set as done"}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                    set.done
                      ? "border-transparent bg-[var(--good)] text-white"
                      : "border-line bg-surface2 text-muted"
                  }`}
                >
                  {isPr && set.done ? <Trophy size={16} /> : <Check size={16} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onAddSet} className="btn-ghost h-9 flex-1 text-xs">
          <Plus size={14} /> Add set
        </button>
        {entry.sets.length > 1 && (
          <button
            type="button"
            onClick={() => onRemoveSet(entry.sets.length - 1)}
            className="btn-ghost h-9 px-3 text-xs"
          >
            <X size={14} /> Remove set
          </button>
        )}
      </div>

      {pr && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <Flame size={12} /> Best est. 1RM {round(kgToDisplay(pr.best1rm, unit) ?? 0)} {unit}
        </p>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- picker */

function ExercisePicker({
  library,
  onPick,
  onClose,
}: {
  library: LibraryItem[];
  onPick: (item: LibraryItem) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = library.filter(
    (l) =>
      l.name.toLowerCase().includes(q.toLowerCase()) ||
      l.muscleGroup.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4">
        <div className="mb-3 flex items-center gap-3">
          <input
            autoFocus
            className="input"
            placeholder="Search exercises…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" onClick={onClose} className="btn-ghost h-11 px-3">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-6">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item)}
              className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-left"
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-xs capitalize text-muted">{item.muscleGroup}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              Nothing matches. You can create new exercises under More → Exercises.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPace(minPerKm: number) {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
