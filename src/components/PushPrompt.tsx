"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

/** Nudge to turn on notifications, shown until the browser permission is granted. */
export default function PushPrompt() {
  const [state, setState] = useState<"hidden" | "ask" | "working" | "error">("hidden");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("push-prompt-dismissed") === "1") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission === "granted") return;
    setState("ask");
  }, []);

  if (state === "hidden") return null;

  const enable = async () => {
    setState("working");
    try {
      const { subscribeToPush } = await import("@/lib/push-client");
      await subscribeToPush();
      setState("hidden");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not enable notifications.");
      setState("error");
    }
  };

  return (
    <div className="card mb-4 flex items-start gap-3 border-brand/40">
      <Bell size={20} className="mt-0.5 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Turn on reminders</p>
        <p className="mt-0.5 text-sm text-muted">
          Get a nudge for gym days, weigh-ins, water and meal logging.
        </p>
        {state === "error" && <p className="mt-1 text-sm text-[var(--bad)]">{message}</p>}
        <button
          type="button"
          onClick={enable}
          disabled={state === "working"}
          className="btn-primary mt-3 h-9 text-xs"
        >
          {state === "working" ? "Enabling…" : "Enable notifications"}
        </button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-muted"
        onClick={() => {
          localStorage.setItem("push-prompt-dismissed", "1");
          setState("hidden");
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
