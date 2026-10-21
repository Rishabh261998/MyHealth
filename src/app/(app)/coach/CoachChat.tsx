"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, SendHorizontal, Sparkles } from "lucide-react";

export type ChatTurn = { id: string; role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "What should I focus on in today's session?",
  "How is my protein intake looking?",
  "Am I recovered enough to train hard today?",
  "Plan my meals for the rest of today.",
];

const MAX_CHARS = 2000;

export default function CoachChat({
  conversationId,
  initialTurns,
  aiEnabled,
}: {
  conversationId: string | null;
  initialTurns: ChatTurn[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef(conversationId);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  useEffect(() => () => abort.current?.abort(), []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    if (!convId.current) {
      convId.current = crypto.randomUUID();
      window.history.replaceState(null, "", `/coach?c=${convId.current}`);
    }

    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: "user", text: message };
    const replyId = `a-${Date.now()}`;
    setTurns((t) => [...t, userTurn]);
    setDraft("");
    setError(null);
    setBusy(true);

    const controller = new AbortController();
    abort.current = controller;
    let reply = "";
    let failed: string | null = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId.current, message }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "The coach could not answer just now. Try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buffer += decoder.decode(chunk.value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const event = JSON.parse(raw) as { t: string; text?: string; message?: string };
          if (event.t === "delta" && event.text) {
            reply += event.text;
            const shown = reply;
            setTurns((t) => {
              const rest = t.filter((x) => x.id !== replyId);
              return [...rest, { id: replyId, role: "assistant", text: shown }];
            });
          } else if (event.t === "error") {
            failed = event.message ?? "The coach could not answer just now. Try again.";
          }
        }
      }
      if (!failed && !reply) failed = "The coach's answer came back empty. Try again.";
    } catch (err) {
      if (controller.signal.aborted) return;
      failed = err instanceof Error ? err.message : "The coach could not answer just now. Try again.";
    } finally {
      setBusy(false);
      abort.current = null;
    }

    if (failed) {
      // Nothing was saved on the server: take the exchange back out and give
      // the message back so it can be re-sent.
      setTurns((t) => t.filter((x) => x.id !== replyId && x.id !== userTurn.id));
      setDraft(message);
      setError(failed);
    }
  }

  function newChat() {
    abort.current?.abort();
    router.push(`/coach?c=${crypto.randomUUID()}`);
  }

  if (!aiEnabled) {
    return (
      <div className="card text-sm text-muted">
        The AI coach is not set up on this deployment. Add an{" "}
        <code className="text-ink">ANTHROPIC_API_KEY</code> environment variable and redeploy to
        turn it on.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {turns.length > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={newChat} className="chip" disabled={busy}>
            <Plus size={14} /> New chat
          </button>
        </div>
      )}

      {turns.length === 0 && (
        <div className="card">
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles size={18} className="text-brand" /> Your coach can see your data
          </p>
          <p className="mt-1 text-sm text-muted">
            Your plan, recent sessions, PRs, weight trend, today&apos;s food and recovery are shared
            with each question so answers are about you, not generic advice.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-xl border border-line bg-surface2 px-3 py-2 text-left text-sm"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3" aria-live="polite">
        {turns.map((t) => (
          <li key={t.id} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                t.role === "user"
                  ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm text-white"
                  : "max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-sm"
              }
            >
              {t.text}
            </div>
          </li>
        ))}
        {busy && turns.at(-1)?.role === "user" && (
          <li className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Thinking…
            </div>
          </li>
        )}
      </ul>

      {error && (
        <p role="alert" className="rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] flex items-end gap-2 rounded-2xl border border-line bg-surface p-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={1}
          placeholder="Ask your coach…"
          aria-label="Message"
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-ink outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Send"
          className="btn-primary h-11 w-11 shrink-0 p-0"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} />}
        </button>
      </form>
      <div ref={bottom} />
    </div>
  );
}
