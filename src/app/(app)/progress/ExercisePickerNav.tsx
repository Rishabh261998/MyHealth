"use client";

import { useRouter } from "next/navigation";

export default function ExercisePickerNav({
  exercises,
  selectedId,
  range,
}: {
  exercises: { id: number; name: string; muscleGroup: string }[];
  selectedId: number | null;
  range: string;
}) {
  const router = useRouter();

  return (
    <div>
      <label className="label" htmlFor="exercise-select">
        Strength for
      </label>
      <select
        id="exercise-select"
        className="input"
        value={selectedId ?? ""}
        onChange={(e) => router.push(`/progress?ex=${e.target.value}&range=${range}`)}
      >
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>
    </div>
  );
}
