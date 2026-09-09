"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { addMeal } from "./actions";

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

/** A few things people eat over and over — one tap instead of typing macros. */
const PRESETS = [
  { name: "Whey shake", slot: "snack", calories: 130, protein: 25, carbs: 4, fat: 2 },
  { name: "3 eggs + toast", slot: "breakfast", calories: 380, protein: 24, carbs: 30, fat: 18 },
  { name: "Chicken + rice", slot: "lunch", calories: 620, protein: 48, carbs: 70, fat: 14 },
  { name: "Dal + roti", slot: "dinner", calories: 480, protein: 18, carbs: 68, fat: 12 },
  { name: "Paneer bowl", slot: "dinner", calories: 520, protein: 30, carbs: 40, fat: 24 },
  { name: "Banana", slot: "snack", calories: 105, protein: 1, carbs: 27, fat: 0 },
] as const;

export default function AddMealForm({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setOpen(true);
    queueMicrotask(() => {
      const form = formRef.current;
      if (!form) return;
      (form.elements.namedItem("name") as HTMLInputElement).value = p.name;
      (form.elements.namedItem("slot") as HTMLSelectElement).value = p.slot;
      (form.elements.namedItem("calories") as HTMLInputElement).value = String(p.calories);
      (form.elements.namedItem("protein") as HTMLInputElement).value = String(p.protein);
      (form.elements.namedItem("carbs") as HTMLInputElement).value = String(p.carbs);
      (form.elements.namedItem("fat") as HTMLInputElement).value = String(p.fat);
    });
  };

  if (!open) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setOpen(true)} className="btn-primary w-full">
          <Plus size={18} /> Add a meal
        </button>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className="chip hover:text-ink"
            >
              + {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await addMeal(formData);
        formRef.current?.reset();
        setOpen(false);
      }}
      className="card space-y-3"
    >
      <input type="hidden" name="date" value={date} />

      <div>
        <label className="label" htmlFor="meal-name">
          What did you eat?
        </label>
        <input
          id="meal-name"
          name="name"
          required
          className="input"
          placeholder="Chicken, rice and salad"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="meal-slot">
            Meal
          </label>
          <select id="meal-slot" name="slot" className="input capitalize" defaultValue="snack">
            {SLOTS.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="meal-time">
            Time
          </label>
          <input
            id="meal-time"
            name="time"
            type="time"
            className="input"
            defaultValue={new Date().toTimeString().slice(0, 5)}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Num id="calories" label="kcal" />
        <Num id="protein" label="Protein" />
        <Num id="carbs" label="Carbs" />
        <Num id="fat" label="Fat" />
      </div>

      <div>
        <label className="label" htmlFor="meal-notes">
          Notes
        </label>
        <input id="meal-notes" name="notes" className="input" placeholder="Optional" />
      </div>

      <label className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm">
        <input type="checkbox" name="isJunk" className="h-4 w-4 accent-[var(--bad)]" />
        <span>This was junk food / a cheat meal</span>
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1">
          Save meal
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Num({ id, label }: { id: string; label: string }) {
  return (
    <div>
      <label className="label !text-[10px]" htmlFor={`meal-${id}`}>
        {label}
      </label>
      <input
        id={`meal-${id}`}
        name={id}
        type="number"
        inputMode="numeric"
        className="input px-2 text-center tabular-nums"
        placeholder="—"
      />
    </div>
  );
}
