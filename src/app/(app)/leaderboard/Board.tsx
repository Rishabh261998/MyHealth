import { Flame } from "lucide-react";

type Row = {
  userId: number;
  name: string;
  isMe: boolean;
  sessionsWeek: number;
  setsWeek: number;
  volumeKgWeek: number;
  volumeDisplay: number;
  streak: number;
};

const MEDAL = ["🥇", "🥈", "🥉"];

export default function Board({ rows, unit }: { rows: Row[]; unit: string }) {
  return (
    <ol className="space-y-2">
      {rows.map((row, i) => (
        <li
          key={row.userId}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
            row.isMe ? "border-brand bg-[var(--brand-soft)]" : "border-line bg-surface"
          }`}
        >
          <span className="w-7 shrink-0 text-center text-lg font-bold tabular-nums">
            {MEDAL[i] ?? <span className="text-sm text-muted">{i + 1}</span>}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {row.name}
              {row.isMe && <span className="ml-2 text-xs font-normal text-brand">you</span>}
            </p>
            <p className="text-xs tabular-nums text-muted">
              {row.setsWeek} sets · {row.volumeDisplay.toLocaleString()} {unit}
              {row.streak > 1 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[var(--warn)]">
                  <Flame size={11} /> {row.streak}d
                </span>
              )}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-xl font-bold tabular-nums">{row.sessionsWeek}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted">sessions</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
