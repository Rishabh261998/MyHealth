"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  addExerciseToDay,
  moveRoutineExercise,
  removeRoutineExercise,
  updateRoutineDay,
  updateRoutineExercise,
} from "./actions";

type Item = {
  id: number;
  exerciseId: number;
  name: string;
  muscleGroup: string;
  targetSets: number;
  repLow: number;
  repHigh: number;
};

export default function DayEditor({
  day,
  items,
  library,
  isToday,
}: {
  day: {
    id: number;
    dayOfWeek: number;
    dayName: string;
    label: string;
    kind: string;
    notes: string;
  };
  items: Item[];
  library: { id: number; name: string; muscleGroup: string }[];
  isToday: boolean;
}) {
  const [open, setOpen] = useState(isToday);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-surface ${
        isToday ? "border-brand/50" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {day.dayName}
            {isToday && <span className="ml-2 text-brand">today</span>}
          </p>
          <p className="truncate font-semibold">{day.label}</p>
        </div>
        <span className="text-xs tabular-nums text-muted">
          {day.kind === "rest" ? "rest" : `${items.length} exercises`}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-line px-4 py-4">
          {day.notes && !editing && <p className="mb-3 text-sm text-muted">{day.notes}</p>}

          {editing ? (
            <form
              action={async (fd) => {
                await updateRoutineDay(fd);
                setEditing(false);
              }}
              className="mb-4 space-y-3 rounded-xl border border-line bg-surface2 p-3"
            >
              <input type="hidden" name="routineDayId" value={day.id} />
              <div>
                <label className="label" htmlFor={`label-${day.id}`}>
                  Day name
                </label>
                <input
                  id={`label-${day.id}`}
                  name="label"
                  className="input"
                  defaultValue={day.label}
                />
              </div>
              <div>
                <label className="label" htmlFor={`kind-${day.id}`}>
                  Type
                </label>
                <select
                  id={`kind-${day.id}`}
                  name="kind"
                  className="input"
                  defaultValue={day.kind}
                >
                  <option value="strength">Strength</option>
                  <option value="cardio">Cardio / run</option>
                  <option value="rest">Rest</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`notes-${day.id}`}>
                  Notes
                </label>
                <textarea
                  id={`notes-${day.id}`}
                  name="notes"
                  className="input min-h-[70px]"
                  defaultValue={day.notes}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary h-9 flex-1 text-xs">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-ghost h-9 text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-ghost mb-4 h-8 text-xs"
            >
              Edit day
            </button>
          )}

          {items.length > 0 && (
            <ul className="divide-y divide-line">
              {items.map((item, i) => (
                <li key={item.id} className="py-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 w-5 text-sm tabular-nums text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.name}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <NumberField
                          label="sets"
                          value={item.targetSets}
                          onChange={(v) =>
                            startTransition(() =>
                              updateRoutineExercise(item.id, { targetSets: v }),
                            )
                          }
                        />
                        <NumberField
                          label="from"
                          value={item.repLow}
                          onChange={(v) =>
                            startTransition(() => updateRoutineExercise(item.id, { repLow: v }))
                          }
                        />
                        <NumberField
                          label="to reps"
                          value={item.repHigh}
                          onChange={(v) =>
                            startTransition(() => updateRoutineExercise(item.id, { repHigh: v }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${item.name} up`}
                        disabled={i === 0}
                        onClick={() => startTransition(() => moveRoutineExercise(item.id, -1))}
                        className="rounded-md border border-line p-1 text-muted disabled:opacity-30"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.name} down`}
                        disabled={i === items.length - 1}
                        onClick={() => startTransition(() => moveRoutineExercise(item.id, 1))}
                        className="rounded-md border border-line p-1 text-muted disabled:opacity-30"
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => startTransition(() => removeRoutineExercise(item.id))}
                        className="rounded-md border border-line p-1 text-[var(--bad)]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {adding ? (
            <form
              action={async (fd) => {
                await addExerciseToDay(fd);
                setAdding(false);
              }}
              className="mt-3 space-y-3 rounded-xl border border-line bg-surface2 p-3"
            >
              <input type="hidden" name="routineDayId" value={day.id} />
              <div>
                <label className="label" htmlFor={`pick-${day.id}`}>
                  From your library
                </label>
                <select id={`pick-${day.id}`} name="exerciseId" className="input" defaultValue="">
                  <option value="">— or type a new one below —</option>
                  {library.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="name" className="input" placeholder="New exercise name" />
                <input name="muscleGroup" className="input" placeholder="Muscle group" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  name="sets"
                  type="number"
                  className="input text-center"
                  defaultValue={3}
                  aria-label="Sets"
                />
                <input
                  name="repLow"
                  type="number"
                  className="input text-center"
                  defaultValue={8}
                  aria-label="Minimum reps"
                />
                <input
                  name="repHigh"
                  type="number"
                  className="input text-center"
                  defaultValue={12}
                  aria-label="Maximum reps"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary h-9 flex-1 text-xs">
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="btn-ghost h-9 text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn-ghost mt-3 h-9 w-full text-xs"
            >
              <Plus size={14} /> Add exercise
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-muted">
      <input
        type="number"
        defaultValue={value}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v > 0 && v !== value) onChange(Math.trunc(v));
        }}
        className="w-8 bg-transparent text-center tabular-nums text-ink outline-none"
        aria-label={label}
      />
      {label}
    </label>
  );
}
