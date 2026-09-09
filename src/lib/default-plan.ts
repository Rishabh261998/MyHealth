/**
 * The plan a brand-new account starts with: a 5-day Push / Pull / Legs split
 * with a Saturday run and a Sunday rest day. Everything here is editable in
 * the app afterwards — this is only the starting point.
 */

export type PlannedExercise = {
  name: string;
  muscleGroup: string;
  kind?: "strength" | "cardio" | "bodyweight";
  sets: number;
  repLow: number;
  repHigh: number;
  notes?: string;
};

export type PlannedDay = {
  dayOfWeek: number; // 0 = Sunday
  label: string;
  kind: "strength" | "cardio" | "rest";
  notes?: string;
  exercises: PlannedExercise[];
};

export const DEFAULT_PLAN: PlannedDay[] = [
  {
    dayOfWeek: 1,
    label: "Push A",
    kind: "strength",
    notes: "Chest, shoulders, triceps. Heavy day — lead with the bench press.",
    exercises: [
      { name: "Barbell Bench Press", muscleGroup: "chest", sets: 4, repLow: 5, repHigh: 8 },
      { name: "Incline Dumbbell Press", muscleGroup: "chest", sets: 3, repLow: 8, repHigh: 12 },
      { name: "Seated Overhead Press", muscleGroup: "shoulders", sets: 3, repLow: 6, repHigh: 10 },
      { name: "Cable Chest Fly", muscleGroup: "chest", sets: 3, repLow: 12, repHigh: 15 },
      { name: "Lateral Raise", muscleGroup: "shoulders", sets: 3, repLow: 12, repHigh: 20 },
      { name: "Triceps Rope Pushdown", muscleGroup: "triceps", sets: 3, repLow: 10, repHigh: 15 },
      { name: "Overhead Triceps Extension", muscleGroup: "triceps", sets: 3, repLow: 10, repHigh: 15 },
    ],
  },
  {
    dayOfWeek: 2,
    label: "Pull A",
    kind: "strength",
    notes: "Back and biceps. Deadlift first while you are fresh.",
    exercises: [
      { name: "Deadlift", muscleGroup: "back", sets: 3, repLow: 3, repHigh: 6 },
      { name: "Pull-Up", muscleGroup: "back", kind: "bodyweight", sets: 3, repLow: 6, repHigh: 12, notes: "Add weight once you clear 12 clean reps." },
      { name: "Barbell Row", muscleGroup: "back", sets: 3, repLow: 8, repHigh: 12 },
      { name: "Lat Pulldown", muscleGroup: "back", sets: 3, repLow: 10, repHigh: 15 },
      { name: "Face Pull", muscleGroup: "shoulders", sets: 3, repLow: 15, repHigh: 20 },
      { name: "Barbell Curl", muscleGroup: "biceps", sets: 3, repLow: 8, repHigh: 12 },
      { name: "Hammer Curl", muscleGroup: "biceps", sets: 3, repLow: 10, repHigh: 15 },
    ],
  },
  {
    dayOfWeek: 3,
    label: "Legs",
    kind: "strength",
    notes: "Quads, hamstrings, glutes, calves and core.",
    exercises: [
      { name: "Barbell Back Squat", muscleGroup: "quads", sets: 4, repLow: 5, repHigh: 8 },
      { name: "Romanian Deadlift", muscleGroup: "hamstrings", sets: 3, repLow: 8, repHigh: 12 },
      { name: "Leg Press", muscleGroup: "quads", sets: 3, repLow: 10, repHigh: 15 },
      { name: "Seated Leg Curl", muscleGroup: "hamstrings", sets: 3, repLow: 10, repHigh: 15 },
      { name: "Leg Extension", muscleGroup: "quads", sets: 3, repLow: 12, repHigh: 15 },
      { name: "Standing Calf Raise", muscleGroup: "calves", sets: 4, repLow: 12, repHigh: 20 },
      { name: "Hanging Leg Raise", muscleGroup: "core", kind: "bodyweight", sets: 3, repLow: 10, repHigh: 20 },
    ],
  },
  {
    dayOfWeek: 4,
    label: "Push B",
    kind: "strength",
    notes: "Second push day — incline and shoulder focus, lighter on the flat bench.",
    exercises: [
      { name: "Incline Barbell Press", muscleGroup: "chest", sets: 4, repLow: 6, repHigh: 10 },
      { name: "Flat Dumbbell Press", muscleGroup: "chest", sets: 3, repLow: 8, repHigh: 12 },
      { name: "Standing Overhead Press", muscleGroup: "shoulders", sets: 3, repLow: 6, repHigh: 10 },
      { name: "Dips", muscleGroup: "triceps", kind: "bodyweight", sets: 3, repLow: 8, repHigh: 15 },
      { name: "Cable Lateral Raise", muscleGroup: "shoulders", sets: 3, repLow: 12, repHigh: 20 },
      { name: "Skull Crusher", muscleGroup: "triceps", sets: 3, repLow: 10, repHigh: 12 },
      { name: "Pec Deck", muscleGroup: "chest", sets: 3, repLow: 12, repHigh: 15 },
    ],
  },
  {
    dayOfWeek: 5,
    label: "Pull B",
    kind: "strength",
    notes: "Second pull day — rows and arms, no heavy deadlift.",
    exercises: [
      { name: "T-Bar Row", muscleGroup: "back", sets: 4, repLow: 8, repHigh: 12 },
      { name: "Chest-Supported Row", muscleGroup: "back", sets: 3, repLow: 10, repHigh: 12 },
      { name: "Wide-Grip Lat Pulldown", muscleGroup: "back", sets: 3, repLow: 10, repHigh: 15 },
      { name: "Seated Cable Row", muscleGroup: "back", sets: 3, repLow: 10, repHigh: 15 },
      { name: "Rear Delt Fly", muscleGroup: "shoulders", sets: 3, repLow: 15, repHigh: 20 },
      { name: "Preacher Curl", muscleGroup: "biceps", sets: 3, repLow: 8, repHigh: 12 },
      { name: "Cable Curl", muscleGroup: "biceps", sets: 3, repLow: 12, repHigh: 15 },
    ],
  },
  {
    dayOfWeek: 6,
    label: "Run",
    kind: "cardio",
    notes: "Easy conversational pace unless you have a session planned.",
    exercises: [
      { name: "Outdoor Run", muscleGroup: "cardio", kind: "cardio", sets: 1, repLow: 0, repHigh: 0 },
    ],
  },
  {
    dayOfWeek: 0,
    label: "Rest",
    kind: "rest",
    notes: "Full rest day. Walk, stretch, eat well, sleep.",
    exercises: [],
  },
];

export const DEFAULT_REMINDERS = [
  {
    kind: "gym",
    title: "Gym time",
    body: "Today's session is waiting. Open the app to see your exercises.",
    timeLocal: "18:00",
    days: "1,2,3,4,5",
    url: "/workout",
  },
  {
    kind: "gym",
    title: "Run day",
    body: "Saturday run. Lace up and log the distance afterwards.",
    timeLocal: "07:00",
    days: "6",
    url: "/workout",
  },
  {
    kind: "weigh_in",
    title: "Morning weigh-in",
    body: "Step on the scale before breakfast and log it.",
    timeLocal: "07:30",
    days: "0,1,2,3,4,5,6",
    url: "/body",
  },
  {
    kind: "water",
    title: "Drink water",
    body: "Halfway through the day — how is your water intake?",
    timeLocal: "14:00",
    days: "0,1,2,3,4,5,6",
    url: "/nutrition",
  },
  {
    kind: "meal",
    title: "Log your meals",
    body: "Two minutes now saves you guessing later. Log what you ate today.",
    timeLocal: "21:00",
    days: "0,1,2,3,4,5,6",
    url: "/nutrition",
  },
  {
    kind: "junk_check",
    title: "Weekly check-in",
    body: "Review last week: workouts hit, junk meals, weight trend.",
    timeLocal: "10:00",
    days: "0",
    url: "/progress",
  },
];
