import { desc, eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { db } from "@/db";
import { notes } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import { requireUser } from "@/lib/auth";
import { prettyDate, todayInTz } from "@/lib/dates";
import { addNote, deleteNote } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await requireUser();
  const today = todayInTz(user.timezone);

  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, user.id))
    .orderBy(desc(notes.date), desc(notes.id))
    .limit(100);

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="Sleep, energy, niggles, anything worth remembering"
        back="/more"
      />

      <form action={addNote} className="card space-y-3">
        <input type="hidden" name="date" value={today} />
        <div>
          <label className="label" htmlFor="title">
            Title
          </label>
          <input id="title" name="title" className="input" placeholder="Optional" />
        </div>
        <div>
          <label className="label" htmlFor="body">
            Note
          </label>
          <textarea
            id="body"
            name="body"
            required
            className="input min-h-[100px]"
            placeholder="Left shoulder felt tight on incline press. Slept badly."
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Scale id="mood" label="Mood 1-5" />
          <Scale id="energy" label="Energy 1-5" />
          <div>
            <label className="label !text-[10px]" htmlFor="sleep">
              Sleep hrs
            </label>
            <input
              id="sleep"
              name="sleep"
              type="number"
              step="0.5"
              inputMode="decimal"
              className="input px-2 text-center tabular-nums"
              placeholder="—"
            />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full">
          Save note
        </button>
      </form>

      <h2 className="h-section mb-2 mt-6">Entries</h2>
      {rows.length === 0 ? (
        <Empty title="No notes yet" hint="Track how you feel and patterns start showing up." />
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {n.title && <p className="font-semibold">{n.title}</p>}
                  <p className="text-xs text-muted">
                    {prettyDate(n.date)}
                    {n.mood != null && ` · mood ${n.mood}/5`}
                    {n.energy != null && ` · energy ${n.energy}/5`}
                    {n.sleepHours != null && ` · ${n.sleepHours}h sleep`}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{n.body}</p>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await deleteNote(n.id);
                  }}
                >
                  <button type="submit" aria-label="Delete note" className="text-muted">
                    <Trash2 size={16} />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Scale({ id, label }: { id: string; label: string }) {
  return (
    <div>
      <label className="label !text-[10px]" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="number"
        min={1}
        max={5}
        inputMode="numeric"
        className="input px-2 text-center tabular-nums"
        placeholder="—"
      />
    </div>
  );
}
