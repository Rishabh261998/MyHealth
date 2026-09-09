import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import QuickWater from "@/components/QuickWater";
import MacroBar from "@/components/MacroBar";
import DateNav from "@/components/DateNav";
import { db } from "@/db";
import { meals } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { prettyDate, startOfWeekStr, todayInTz } from "@/lib/dates";
import { getDayNutrition } from "@/lib/queries";
import AddMealForm from "./AddMealForm";
import { deleteMeal } from "./actions";

export const dynamic = "force-dynamic";

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const user = await requireUser();
  const { d } = await searchParams;
  const today = todayInTz(user.timezone);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? d! : today;

  const [totals, dayMeals, weekJunk] = await Promise.all([
    getDayNutrition(user.id, date),
    db
      .select()
      .from(meals)
      .where(and(eq(meals.userId, user.id), eq(meals.date, date)))
      .orderBy(asc(meals.time), asc(meals.id)),
    db
      .select({ id: meals.id, name: meals.name, date: meals.date })
      .from(meals)
      .where(
        and(
          eq(meals.userId, user.id),
          eq(meals.isJunk, true),
          gte(meals.date, startOfWeekStr(today)),
        ),
      ),
  ]);

  const junkLimit = user.weeklyJunkLimit ?? 3;

  return (
    <>
      <PageHeader title="Food" subtitle={prettyDate(date)} />

      <DateNav date={date} today={today} basePath="/nutrition" />

      <div className="card mt-4">
        <MacroBar
          calories={totals.calories}
          protein={totals.protein}
          carbs={totals.carbs}
          fat={totals.fat}
          calorieGoal={user.dailyCalories ?? 2200}
          proteinGoal={user.dailyProteinG ?? 140}
        />
      </div>

      <div className="mt-4">
        <QuickWater date={date} current={totals.waterMl} goal={user.dailyWaterMl ?? 3000} />
      </div>

      <div className="mt-4">
        <AddMealForm date={date} />
      </div>

      <h2 className="h-section mb-2 mt-6">Meals</h2>
      {dayMeals.length === 0 ? (
        <Empty title="Nothing logged for this day" hint="Add a meal above — even a rough estimate is better than nothing." />
      ) : (
        <div className="space-y-4">
          {SLOTS.filter((slot) => dayMeals.some((m) => m.slot === slot)).map((slot) => (
            <section key={slot}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                {slot}
              </h3>
              <ul className="space-y-2">
                {dayMeals
                  .filter((m) => m.slot === slot)
                  .map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {m.name}
                          {m.isJunk && (
                            <span className="ml-2 rounded-full bg-[var(--bad)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--bad)]">
                              junk
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted">
                          {m.time}
                          {m.calories != null && ` · ${m.calories} kcal`}
                          {m.proteinG != null && ` · ${m.proteinG}g protein`}
                          {m.carbsG != null && ` · ${m.carbsG}g carbs`}
                          {m.fatG != null && ` · ${m.fatG}g fat`}
                        </p>
                        {m.notes && <p className="mt-1 text-xs text-muted">{m.notes}</p>}
                      </div>
                      <form
                        action={async () => {
                          "use server";
                          await deleteMeal(m.id);
                        }}
                      >
                        <button
                          type="submit"
                          aria-label={`Delete ${m.name}`}
                          className="text-muted"
                        >
                          <Trash2 size={16} />
                        </button>
                      </form>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section
        className={`card mt-6 ${weekJunk.length > junkLimit ? "border-[var(--bad)]/40" : ""}`}
      >
        <h2 className="font-semibold">This week&apos;s junk food</h2>
        <p className="mt-1 text-sm text-muted">
          {weekJunk.length} of {junkLimit} allowed since {startOfWeekStr(today)}.
          {weekJunk.length > junkLimit && " You are over budget — reset with the next meal."}
        </p>
        {weekJunk.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {weekJunk.map((j) => (
              <li key={j.id} className="chip">
                {j.name}
              </li>
            ))}
          </ul>
        )}
        <Link href="/settings" className="mt-3 inline-block text-xs text-brand underline">
          Change your weekly limit
        </Link>
      </section>
    </>
  );
}
