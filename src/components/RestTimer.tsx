"use client";

import { useEffect, useRef, useState } from "react";
import { Timer, X } from "lucide-react";

const PRESETS = [60, 90, 120, 180];

/** A floating rest timer — the one thing you always want mid-session. */
export default function RestTimer() {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const endsAt = useRef<number | null>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => {
      if (!endsAt.current) return;
      const left = Math.max(0, Math.round((endsAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        endsAt.current = null;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.([200, 100, 200]);
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [remaining]);

  const start = (seconds: number) => {
    endsAt.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
    setOpen(false);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-xl">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => start(p)}
              className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-surface2"
            >
              {p < 60 ? `${p}s` : `${p / 60} min`}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => (remaining > 0 ? (endsAt.current = null, setRemaining(0)) : setOpen((o) => !o))}
        className={`flex h-14 items-center gap-2 rounded-full px-4 font-bold tabular-nums shadow-xl ${
          remaining > 0 ? "bg-brand text-white" : "border border-line bg-surface text-muted"
        }`}
        aria-label="Rest timer"
      >
        {remaining > 0 ? (
          <>
            {mm}:{ss} <X size={16} />
          </>
        ) : (
          <Timer size={22} />
        )}
      </button>
    </div>
  );
}
