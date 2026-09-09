import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { DAY_NAMES, dowInTz } from "@/lib/dates";
import { getFullRoutine } from "@/lib/queries";
import DayEditor from "./DayEditor";

export const dynamic = "force-dynamic";

// Monday first — that is how a training week actually reads.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default async function PlanPage() {
  const user = await requireUser();
  const routine = await getFullRoutine(user.id);
  const todayDow = dowInTz(user.timezone);

  const library = await db
    .select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup })
    .from(exercises)
    .where(and(eq(exercises.userId, user.id), eq(exercises.archived, false)))
    .orderBy(asc(exercises.name));

  const ordered = WEEK_ORDER.map((dow) => routine.find((r) => r.day.dayOfWeek === dow)).filter(
    (r): r is NonNullable<typeof r> => Boolean(r),
  );

  return (
    <>
      <PageHeader
        title="Weekly plan"
        subtitle="Your split, exercise by exercise. Edit anything."
        back="/workout"
      />

      <div className="space-y-3">
        {ordered.map(({ day, items }) => (
          <DayEditor
            key={day.id}
            day={{
              id: day.id,
              dayOfWeek: day.dayOfWeek,
              dayName: DAY_NAMES[day.dayOfWeek],
              label: day.label,
              kind: day.kind,
              notes: day.notes,
            }}
            items={items}
            library={library}
            isToday={day.dayOfWeek === todayDow}
          />
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Changes apply to the next workout you start. Sessions you already logged stay as they were.
      </p>
    </>
  );
}
