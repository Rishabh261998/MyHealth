import Link from "next/link";
import { CalendarDays, Dumbbell, Play, Route } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import { requireUser } from "@/lib/auth";
import { DAY_NAMES, dowInTz, prettyDate, todayInTz } from "@/lib/dates";
import { getRecentWorkouts, getRoutineForDay } from "@/lib/queries";
import { kgToDisplay, round } from "@/lib/units";
import { startTodaysWorkout } from "./actions";

export default async function WorkoutIndex() {
  const user = await requireUser();
  const today = todayInTz(user.timezone);
  const dow = dowInTz(user.timezone);
  const routine = await getRoutineForDay(user.id, dow);
  const recent = await getRecentWorkouts(user.id, 15);

  const isRest = routine?.day.kind === "rest";
  const doneToday = recent.find((w) => w.date === today);

  return (
    <>
      <PageHeader
        title="Train"
        subtitle={`${DAY_NAMES[dow]} · ${routine?.day.label ?? "No plan set"}`}
        action={
          <Link href="/plan" className="btn-ghost mt-0.5 h-9 px-3 text-xs">
            <CalendarDays size={14} /> Plan
          </Link>
        }
      />

      <section className="card mb-5">
        {isRest ? (
          <>
            <h2 className="text-lg font-semibold">Rest day</h2>
            <p className="mt-1 text-sm text-muted">
              {routine?.day.notes || "Recover today. You earned it."}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {routine?.day.kind === "cardio" ? <Route size={18} /> : <Dumbbell size={18} />}
              <h2 className="text-lg font-semibold">{routine?.day.label ?? "Workout"}</h2>
            </div>
            {routine?.day.notes && (
              <p className="mt-1 text-sm text-muted">{routine.day.notes}</p>
            )}

            {routine && routine.items.length > 0 && (
              <ol className="mt-3 divide-y divide-line">
                {routine.items.map((item, i) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-5 text-sm tabular-nums text-muted">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium">{item.name}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {item.targetSets} × {item.repLow}
                      {item.repHigh !== item.repLow ? `–${item.repHigh}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        <form action={startTodaysWorkout.bind(null, undefined)} className="mt-4">
          <button type="submit" className="btn-primary w-full">
            <Play size={18} />
            {doneToday ? "Continue today's session" : isRest ? "Log a workout anyway" : "Start workout"}
          </button>
        </form>
      </section>

      <h2 className="h-section mb-2">Recent sessions</h2>
      {recent.length === 0 ? (
        <Empty
          title="No sessions logged yet"
          hint="Start today's workout and every set you enter becomes part of your progress charts."
        />
      ) : (
        <ul className="space-y-2">
          {recent.map((w) => (
            <li key={w.id}>
              <Link
                href={`/workout/${w.id}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {w.label}
                    {!w.finished && (
                      <span className="ml-2 chip !py-0.5 !text-[10px]">in progress</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">{prettyDate(w.date)}</p>
                </div>
                <div className="text-right text-xs tabular-nums text-muted">
                  {w.kind === "cardio" && w.distanceKm ? (
                    <>{round(w.distanceKm, 2)} km</>
                  ) : (
                    <>
                      {w.sets} sets
                      {w.volume > 0 && (
                        <div>
                          {round(kgToDisplay(w.volume, user.unit) ?? 0, 0).toLocaleString()}{" "}
                          {user.unit}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
