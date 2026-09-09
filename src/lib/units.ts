export const KG_PER_LB = 0.45359237;

export function kgToDisplay(kg: number | null | undefined, unit: string): number | null {
  if (kg == null) return null;
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

export function displayToKg(value: number | null | undefined, unit: string): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return unit === "lb" ? value * KG_PER_LB : value;
}

export function fmtWeight(kg: number | null | undefined, unit: string, digits = 1): string {
  const v = kgToDisplay(kg, unit);
  if (v == null) return "—";
  return `${round(v, digits)} ${unit}`;
}

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Epley one-rep-max estimate — the standard way to compare sets of different reps. */
export function estimate1rm(weightKg: number, reps: number): number {
  if (!weightKg || !reps) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
