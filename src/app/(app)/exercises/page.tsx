import { asc, eq } from "drizzle-orm";
import { Archive, ArchiveRestore } from "lucide-react";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { createExercise, toggleArchive } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(exercises)
    .where(eq(exercises.userId, user.id))
    .orderBy(asc(exercises.archived), asc(exercises.name));

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);

  return (
    <>
      <PageHeader
        title="Exercises"
        subtitle={`${active.length} in your library`}
        back="/more"
      />

      <form action={createExercise} className="card space-y-3">
        <div>
          <label className="label" htmlFor="name">
            Exercise name
          </label>
          <input id="name" name="name" required className="input" placeholder="Cable Pullover" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="muscleGroup">
              Muscle group
            </label>
            <input
              id="muscleGroup"
              name="muscleGroup"
              className="input"
              placeholder="chest, back, quads…"
            />
          </div>
          <div>
            <label className="label" htmlFor="kind">
              Type
            </label>
            <select id="kind" name="kind" className="input" defaultValue="strength">
              <option value="strength">Weighted</option>
              <option value="bodyweight">Bodyweight</option>
              <option value="cardio">Cardio</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn-primary w-full">
          Add to library
        </button>
      </form>

      <h2 className="h-section mb-2 mt-6">Your exercises</h2>
      <ul className="space-y-2">
        {active.map((e) => (
          <Row key={e.id} exercise={e} archived={false} />
        ))}
      </ul>

      {archived.length > 0 && (
        <>
          <h2 className="h-section mb-2 mt-6">Archived</h2>
          <ul className="space-y-2 opacity-60">
            {archived.map((e) => (
              <Row key={e.id} exercise={e} archived />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Row({
  exercise,
  archived,
}: {
  exercise: { id: number; name: string; muscleGroup: string; kind: string };
  archived: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{exercise.name}</p>
        <p className="text-xs capitalize text-muted">
          {exercise.muscleGroup} · {exercise.kind}
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await toggleArchive(exercise.id, !archived);
        }}
      >
        <button
          type="submit"
          aria-label={archived ? "Restore exercise" : "Archive exercise"}
          className="text-muted"
        >
          {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        </button>
      </form>
    </li>
  );
}
