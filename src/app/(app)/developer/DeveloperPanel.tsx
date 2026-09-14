"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { createApiKey, revokeApiKey, type CreateKeyState } from "./actions";

type KeyRow = {
  id: number;
  name: string;
  prefix: string;
  scopes: string;
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
};

export default function DeveloperPanel({ keys }: { keys: KeyRow[] }) {
  const [state, formAction, pending] = useActionState<CreateKeyState, FormData>(
    createApiKey,
    undefined,
  );
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  // Set after mount so server and first client render match (avoids hydration mismatch).
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const active = keys.filter((k) => !k.revoked);
  const revoked = keys.filter((k) => k.revoked);
  const justCreated = state && "fullKey" in state ? state : null;

  return (
    <>
      {justCreated && (
        <section className="card mb-4 border-[var(--good)]/50">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-[var(--good)]" />
            <h2 className="font-semibold">Key created — copy it now</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            This is the only time <strong>{justCreated.name}</strong> is shown. Store it somewhere
            safe; if you lose it, revoke it and make a new one.
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(justCreated.fullKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* visible on screen to copy manually */
              }
            }}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-3 text-left"
          >
            <span className="truncate font-mono text-xs">{justCreated.fullKey}</span>
            {copied ? <Check size={15} /> : <Copy size={15} className="text-muted" />}
          </button>
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold">Create a key</h2>
        <form action={formAction} className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="key-name">
              Name
            </label>
            <input
              id="key-name"
              name="name"
              className="input"
              placeholder="e.g. Zapier, my script"
              maxLength={60}
            />
          </div>
          <label className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm">
            <input type="checkbox" name="write" className="h-4 w-4 accent-[var(--brand)]" />
            <span>
              Allow writing data
              <span className="block text-xs text-muted">
                Unchecked = read-only. Checked = can also add meals, weight, water, recovery.
              </span>
            </span>
          </label>
          {state && "error" in state && (
            <p className="text-sm text-[var(--bad)]">{state.error}</p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            <Plus size={16} /> {pending ? "Creating…" : "Create key"}
          </button>
        </form>
      </section>

      <section className="card mt-4">
        <h2 className="font-semibold">Your keys</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No active keys yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {active.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-3">
                <KeyRound size={16} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {k.name}
                    <span className="ml-2 chip !py-0.5 !text-[10px]">
                      {k.scopes.includes("write") ? "read + write" : "read-only"}
                    </span>
                  </p>
                  <p className="font-mono text-xs text-muted">
                    {k.prefix}…{" "}
                    <span className="font-sans">
                      {k.lastUsedAt
                        ? `· used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                        : "· never used"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Revoke ${k.name}`}
                  onClick={() => {
                    if (confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) {
                      startTransition(() => revokeApiKey(k.id));
                    }
                  }}
                  className="shrink-0 text-[var(--bad)]"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {revoked.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            {revoked.length} revoked key{revoked.length === 1 ? "" : "s"} hidden.
          </p>
        )}
      </section>

      <section className="card mt-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--warn)]" />
          <p className="text-sm text-muted">
            A key can read and write <strong>your own</strong> data only. Treat it like a password —
            never commit it to a public repo. Revoke any key you think has leaked.
          </p>
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="font-semibold">Quick start</h2>
        <p className="mt-1 text-sm text-muted">
          Every endpoint lives under <code>/api/v1</code>. Discover them all:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface2 p-3 text-[11px] leading-relaxed">
{`curl ${origin}/api/v1/summary \\
  -H "Authorization: Bearer YOUR_KEY"

curl -X POST ${origin}/api/v1/body \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"weightLb": 181.5}'`}
        </pre>
        <a href="/api/v1" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-brand underline">
          Open the API index (lists every endpoint)
        </a>
      </section>
    </>
  );
}
