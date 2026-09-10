"use client";

import { useActionState, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { login, signup, type AuthState } from "./actions";

export default function AuthForm({ canSignUp }: { canSignUp: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, undefined);
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata");
    } catch {
      /* keep the default */
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white">
          <Activity size={28} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">MyHealth</h1>
        <p className="mt-1 text-sm text-muted">
          Your gym plan, lifts, diet and progress in one place.
        </p>
      </div>

      <form action={formAction} className="card space-y-4">
        <input type="hidden" name="timezone" value={timezone} />

        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input id="name" name="name" className="input" placeholder="Your name" autoComplete="name" />
          </div>
        )}

        {mode === "signup" && (
          <div>
            <span className="label">Weights in</span>
            <div className="flex gap-1.5">
              {(["lb", "kg"] as const).map((option) => (
                <label
                  key={option}
                  className="flex-1 cursor-pointer rounded-xl border border-line bg-surface2 py-2.5 text-center text-sm font-medium has-[:checked]:border-brand has-[:checked]:bg-[var(--brand-soft)] has-[:checked]:text-brand"
                >
                  <input
                    type="radio"
                    name="unit"
                    value={option}
                    defaultChecked={option === "lb"}
                    className="sr-only"
                  />
                  {option === "lb" ? "Pounds (lb)" : "Kilograms (kg)"}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className="input"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="input"
            placeholder="At least 8 characters"
          />
        </div>

        {state?.error && (
          <p className="rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-[var(--bad)]">
            {state.error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      {canSignUp && (
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-5 text-center text-sm text-muted underline underline-offset-4"
        >
          {mode === "login"
            ? "First time here? Create your account"
            : "Already have an account? Log in"}
        </button>
      )}
    </main>
  );
}
