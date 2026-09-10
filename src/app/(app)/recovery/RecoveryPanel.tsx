"use client";

import { useState, useTransition } from "react";
import { Activity, Check, Copy, Loader2, Moon, Plus, RefreshCw, Watch } from "lucide-react";
import {
  connectOura,
  disconnectOura,
  regenerateIngestToken,
  saveManualRecovery,
  syncOura,
  type SyncResult,
} from "./actions";

type OuraState =
  | { connected: false }
  | { connected: true; lastSyncStatus: string | null; lastSyncMessage: string; lastSyncAt: string | null };

export default function RecoveryPanel({
  today,
  ingestToken,
  oura,
}: {
  today: string;
  ingestToken: string | null;
  oura: OuraState;
}) {
  const [tab, setTab] = useState<"oura" | "apple" | "manual">(
    oura.connected ? "oura" : "manual",
  );

  return (
    <section className="card">
      <h2 className="font-semibold">Add recovery data</h2>
      <div className="mt-3 flex gap-1.5">
        {([
          ["oura", "Oura", Activity],
          ["apple", "Apple / Whoop", Watch],
          ["manual", "Manual", Plus],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium ${
              tab === key
                ? "border-brand bg-[var(--brand-soft)] text-brand"
                : "border-line bg-surface2 text-muted"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "oura" && <OuraTab oura={oura} />}
        {tab === "apple" && <IngestTab ingestToken={ingestToken} />}
        {tab === "manual" && <ManualTab today={today} />}
      </div>
    </section>
  );
}

function Feedback({ result }: { result: SyncResult | null }) {
  if (!result) return null;
  return (
    <p className={`mt-2 text-sm ${result.ok ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
      {result.message}
    </p>
  );
}

function OuraTab({ oura }: { oura: OuraState }) {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [pending, start] = useTransition();

  if (oura.connected) {
    return (
      <div>
        <p className="text-sm text-muted">
          Oura is connected.{" "}
          {oura.lastSyncAt
            ? `Last sync ${new Date(oura.lastSyncAt).toLocaleString()}.`
            : "Not synced yet."}
        </p>
        {oura.lastSyncMessage && (
          <p
            className={`mt-1 text-sm ${
              oura.lastSyncStatus === "error" ? "text-[var(--bad)]" : "text-muted"
            }`}
          >
            {oura.lastSyncMessage}
          </p>
        )}
        <Feedback result={result} />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => setResult(await syncOura()))}
            className="btn-primary h-9 flex-1 text-xs"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync now
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Disconnect Oura? Synced history stays.")) {
                start(async () => {
                  await disconnectOura();
                  setResult(null);
                });
              }
            }}
            className="btn-ghost h-9 text-xs"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={(fd) => start(async () => setResult(await connectOura(fd)))}
      className="space-y-3"
    >
      <p className="text-sm text-muted">
        In your browser open{" "}
        <a
          href="https://cloud.ouraring.com/personal-access-tokens"
          target="_blank"
          rel="noreferrer"
          className="text-brand underline"
        >
          cloud.ouraring.com → Personal Access Tokens
        </a>
        , create one, and paste it here. It stays in your own database.
      </p>
      <input
        name="token"
        className="input font-mono text-sm"
        placeholder="Oura personal access token"
        autoComplete="off"
      />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
        Connect &amp; sync
      </button>
      <Feedback result={result} />
    </form>
  );
}

function IngestTab({ ingestToken }: { ingestToken: string | null }) {
  const [token, setToken] = useState(ingestToken);
  const [copied, setCopied] = useState<"url" | "token" | null>(null);
  const [pending, start] = useTransition();

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/api/ingest/wearable`;

  const copy = async (text: string, which: "url" | "token") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* shown on screen to copy manually */
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Apple Watch has no cloud API, so data is <strong>pushed</strong> to your app. Use the free{" "}
        <span className="text-ink">Health Auto Export</span> app, or an Apple Shortcut, to POST a
        daily JSON to this URL. Whoop can use the same webhook via any relay.
      </p>

      <div>
        <span className="label">Webhook URL</span>
        <button
          type="button"
          onClick={() => copy(url, "url")}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2.5 text-left"
        >
          <span className="truncate font-mono text-xs">{url}</span>
          {copied === "url" ? <Check size={14} /> : <Copy size={14} className="text-muted" />}
        </button>
      </div>

      <div>
        <span className="label">Your ingest token</span>
        {token ? (
          <button
            type="button"
            onClick={() => copy(token, "token")}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2.5 text-left"
          >
            <span className="truncate font-mono text-xs">{token}</span>
            {copied === "token" ? <Check size={14} /> : <Copy size={14} className="text-muted" />}
          </button>
        ) : (
          <p className="text-sm text-muted">No token yet — generate one below.</p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setToken(await regenerateIngestToken()))}
          className="btn-ghost mt-2 h-9 text-xs"
        >
          <RefreshCw size={13} /> {token ? "Regenerate token" : "Generate token"}
        </button>
      </div>

      <details className="rounded-xl border border-line bg-surface2 p-3 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-ink">
          What to send (tap for the format)
        </summary>
        <p className="mt-2">
          Send <code>POST</code> with header <code>Authorization: Bearer &lt;token&gt;</code> and a
          JSON body — one day, or an array of days:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-2 text-[11px] leading-relaxed text-ink">
{`{
  "date": "${new Date().toISOString().slice(0, 10)}",
  "sleepHours": 7.5,
  "restingHr": 55,
  "hrv": 62,
  "steps": 9000,
  "activeKcal": 540,
  "readiness": 78
}`}
        </pre>
        <p className="mt-2">
          Any field may be omitted. In Health Auto Export, set the REST API destination to the URL
          above and add the Bearer header.
        </p>
      </details>
    </div>
  );
}

function ManualTab({ today }: { today: string }) {
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) =>
        start(async () => {
          await saveManualRecovery(fd);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        })
      }
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="rdate">
            Date
          </label>
          <input id="rdate" name="date" type="date" className="input" defaultValue={today} max={today} />
        </div>
        <Field id="sleepHours" label="Sleep (hrs)" step="0.1" icon={<Moon size={13} />} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field id="readiness" label="Readiness" />
        <Field id="restingHr" label="Resting HR" />
        <Field id="hrvMs" label="HRV ms" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field id="sleepScore" label="Sleep score" />
        <Field id="steps" label="Steps" />
        <Field id="activeKcal" label="Active kcal" />
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {saved ? <Check size={16} /> : <Plus size={16} />}
        {saved ? "Saved" : "Save day"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  step,
  icon,
}: {
  id: string;
  label: string;
  step?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="label !text-[10px]" htmlFor={id}>
        <span className="inline-flex items-center gap-1">
          {icon}
          {label}
        </span>
      </label>
      <input
        id={id}
        name={id}
        type="number"
        step={step ?? "any"}
        inputMode="decimal"
        className="input px-2 text-center tabular-nums"
        placeholder="—"
      />
    </div>
  );
}
