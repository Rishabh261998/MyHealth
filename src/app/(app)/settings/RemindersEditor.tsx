"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DAY_SHORT } from "@/lib/dates";
import { deleteReminder, toggleReminder, upsertReminder } from "./actions";

type Reminder = {
  id: number;
  kind: string;
  title: string;
  body: string;
  timeLocal: string;
  days: string;
  url: string;
  enabled: boolean;
};

export default function RemindersEditor({ reminders }: { reminders: Reminder[] }) {
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [, startTransition] = useTransition();

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Reminders</h2>
        <button
          type="button"
          onClick={() => setEditingId(editingId === "new" ? null : "new")}
          className="btn-ghost h-8 px-3 text-xs"
        >
          <Plus size={14} /> New
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Times are in your timezone. The scheduler checks every 15 minutes, so a reminder can land a
        few minutes late.
      </p>

      {editingId === "new" && (
        <ReminderForm onDone={() => setEditingId(null)} />
      )}

      <ul className="mt-3 divide-y divide-line">
        {reminders.map((r) =>
          editingId === r.id ? (
            <li key={r.id} className="py-2">
              <ReminderForm reminder={r} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <button
                type="button"
                onClick={() => startTransition(() => toggleReminder(r.id, !r.enabled))}
                aria-label={r.enabled ? `Disable ${r.title}` : `Enable ${r.title}`}
                className={`h-6 w-11 shrink-0 rounded-full border transition ${
                  r.enabled ? "border-brand bg-brand" : "border-line bg-surface2"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                    r.enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => setEditingId(r.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="text-xs tabular-nums text-muted">
                  {r.timeLocal} ·{" "}
                  {r.days
                    .split(",")
                    .map((d) => DAY_SHORT[Number(d)])
                    .join(" ")}
                </p>
              </button>

              <button
                type="button"
                aria-label={`Delete ${r.title}`}
                onClick={() => {
                  if (confirm(`Delete the "${r.title}" reminder?`)) {
                    startTransition(() => deleteReminder(r.id));
                  }
                }}
                className="shrink-0 text-muted"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function ReminderForm({
  reminder,
  onDone,
}: {
  reminder?: Reminder;
  onDone: () => void;
}) {
  const days = (reminder?.days ?? "1,2,3,4,5").split(",");

  return (
    <form
      action={async (fd) => {
        await upsertReminder(fd);
        onDone();
      }}
      className="mt-3 space-y-3 rounded-xl border border-line bg-surface2 p-3"
    >
      {reminder && <input type="hidden" name="id" value={reminder.id} />}
      <input type="hidden" name="kind" value={reminder?.kind ?? "custom"} />

      <div>
        <label className="label" htmlFor="r-title">
          Title
        </label>
        <input
          id="r-title"
          name="title"
          required
          className="input"
          defaultValue={reminder?.title ?? ""}
          placeholder="Gym time"
        />
      </div>

      <div>
        <label className="label" htmlFor="r-body">
          Message
        </label>
        <input
          id="r-body"
          name="body"
          className="input"
          defaultValue={reminder?.body ?? ""}
          placeholder="Don't skip leg day."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="r-time">
            Time
          </label>
          <input
            id="r-time"
            name="timeLocal"
            type="time"
            className="input"
            defaultValue={reminder?.timeLocal ?? "18:00"}
          />
        </div>
        <div>
          <label className="label" htmlFor="r-url">
            Opens
          </label>
          <select id="r-url" name="url" className="input" defaultValue={reminder?.url ?? "/"}>
            <option value="/">Dashboard</option>
            <option value="/workout">Workout</option>
            <option value="/nutrition">Food</option>
            <option value="/body">Body</option>
            <option value="/photos">Photos</option>
            <option value="/progress">Progress</option>
          </select>
        </div>
      </div>

      <div>
        <span className="label">Days</span>
        <div className="flex gap-1">
          {DAY_SHORT.map((name, i) => (
            <label
              key={name}
              className="flex-1 cursor-pointer rounded-lg border border-line bg-surface py-1.5 text-center text-[11px] font-medium has-[:checked]:border-brand has-[:checked]:bg-[var(--brand-soft)] has-[:checked]:text-brand"
            >
              <input
                type="checkbox"
                name={`day-${i}`}
                defaultChecked={days.includes(String(i))}
                className="sr-only"
              />
              {name}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={reminder?.enabled ?? true}
          className="h-4 w-4 accent-[var(--brand)]"
        />
        Enabled
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary h-9 flex-1 text-xs">
          Save reminder
        </button>
        <button type="button" onClick={onDone} className="btn-ghost h-9 text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
