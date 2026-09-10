"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Globe, Trash2, UserPlus } from "lucide-react";
import { addFriend, removeFriend, setPublicLeaderboard, type FriendActionState } from "./actions";

export default function FriendManager({
  shareCode,
  friends,
  publicOptIn,
}: {
  shareCode: string;
  friends: { id: number; name: string }[];
  publicOptIn: boolean;
}) {
  const [state, formAction, pending] = useActionState<FriendActionState, FormData>(
    addFriend,
    undefined,
  );
  const [copied, setCopied] = useState(false);
  const [optIn, setOptIn] = useState(publicOptIn);
  const [, startTransition] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is on screen to type manually */
    }
  };

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="font-semibold">Your code</h2>
        <p className="mt-0.5 text-sm text-muted">
          Give this to a friend so they can add you. It is safe to share — it only links your
          leaderboard, nothing else.
        </p>
        <button
          type="button"
          onClick={copy}
          className="mt-3 flex w-full items-center justify-between rounded-xl border border-line bg-surface2 px-4 py-3"
        >
          <span className="font-mono text-xl font-bold tracking-[0.3em]">{shareCode}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </span>
        </button>
      </section>

      <section className="card">
        <h2 className="font-semibold">Add a friend</h2>
        <form action={formAction} className="mt-3 flex gap-2">
          <input
            name="code"
            className="input font-mono uppercase tracking-widest"
            placeholder="THEIR CODE"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={12}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={pending}>
            <UserPlus size={16} /> Add
          </button>
        </form>
        {state?.error && <p className="mt-2 text-sm text-[var(--bad)]">{state.error}</p>}
        {state?.ok && <p className="mt-2 text-sm text-[var(--good)]">{state.ok}</p>}

        {friends.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {f.name || "Friend"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name || "friend"}`}
                  onClick={() => {
                    if (confirm(`Remove ${f.name || "this friend"} from your leaderboard?`)) {
                      startTransition(() => removeFriend(f.id));
                    }
                  }}
                  className="text-muted"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="flex items-start gap-3">
          <Globe size={20} className="mt-0.5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Show on the global board</h2>
            <p className="mt-0.5 text-sm text-muted">
              Appear on the public leaderboard for everyone on this app. Only your name and weekly
              training stats are shown — never your email, photos or logs. Off by default.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={optIn}
            aria-label="Show on the global leaderboard"
            onClick={() => {
              const next = !optIn;
              setOptIn(next);
              startTransition(() => setPublicLeaderboard(next));
            }}
            className={`mt-0.5 h-6 w-11 shrink-0 rounded-full border transition ${
              optIn ? "border-brand bg-brand" : "border-line bg-surface2"
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                optIn ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>
    </div>
  );
}
