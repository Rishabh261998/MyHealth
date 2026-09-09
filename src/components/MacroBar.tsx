export default function MacroBar({
  calories,
  protein,
  carbs,
  fat,
  calorieGoal,
  proteinGoal,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calorieGoal: number;
  proteinGoal: number;
}) {
  const calPct = calorieGoal > 0 ? Math.min(100, (calories / calorieGoal) * 100) : 0;
  const proPct = proteinGoal > 0 ? Math.min(100, (protein / proteinGoal) * 100) : 0;
  const over = calories > calorieGoal;

  return (
    <div className="space-y-4">
      <Row
        label="Calories"
        value={`${calories} / ${calorieGoal} kcal`}
        pct={calPct}
        color={over ? "var(--warn)" : "var(--brand)"}
      />
      <Row
        label="Protein"
        value={`${protein} / ${proteinGoal} g`}
        pct={proPct}
        color={protein >= proteinGoal ? "var(--good)" : "var(--brand)"}
      />
      <div className="flex gap-3 text-xs tabular-nums text-muted">
        <span>Carbs {carbs}g</span>
        <span>Fat {fat}g</span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted">{value}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface2"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
