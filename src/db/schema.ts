import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* --------------------------------------------------------- app settings */

/**
 * Small key/value store for things the server generates for itself — notably
 * the session-signing secret, so a deployment does not need AUTH_SECRET set by
 * hand to be secure.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ users */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default(""),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  unit: text("unit").notNull().default("lb"), // lb | kg
  // goals
  targetWeightKg: real("target_weight_kg"),
  dailyCalories: integer("daily_calories").default(2200),
  dailyProteinG: integer("daily_protein_g").default(140),
  dailyWaterMl: integer("daily_water_ml").default(3000),
  weeklyJunkLimit: integer("weekly_junk_limit").default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* -------------------------------------------------------------- exercises */

export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    muscleGroup: text("muscle_group").notNull().default("other"),
    kind: text("kind").notNull().default("strength"), // strength | cardio | bodyweight
    notes: text("notes").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [uniqueIndex("exercises_user_name_idx").on(t.userId, t.name)],
);

/* ------------------------------------------------- weekly routine (plan) */

export const routineDays = pgTable(
  "routine_days",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0=Sun .. 6=Sat
    label: text("label").notNull(), // "Push A", "Run", "Rest"
    kind: text("kind").notNull().default("strength"), // strength | cardio | rest
    notes: text("notes").notNull().default(""),
  },
  (t) => [uniqueIndex("routine_days_user_dow_idx").on(t.userId, t.dayOfWeek)],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: serial("id").primaryKey(),
    routineDayId: integer("routine_day_id")
      .notNull()
      .references(() => routineDays.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    targetSets: integer("target_sets").notNull().default(3),
    repLow: integer("rep_low").notNull().default(8),
    repHigh: integer("rep_high").notNull().default(12),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("routine_exercises_day_idx").on(t.routineDayId)],
);

/**
 * A one-off swap: "on this date, do that session instead of the one the weekly
 * plan says". Miss Monday's push day and you can do it on Wednesday without
 * rewriting the plan itself. Only ever applies to the single date named.
 */
export const dayOverrides = pgTable(
  "day_overrides",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    routineDayId: integer("routine_day_id")
      .notNull()
      .references(() => routineDays.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("day_overrides_user_date_idx").on(t.userId, t.date)],
);

/* --------------------------------------------------------------- workouts */

export const workouts = pgTable(
  "workouts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(), // YYYY-MM-DD in the user's timezone
    label: text("label").notNull().default("Workout"),
    kind: text("kind").notNull().default("strength"),
    routineDayId: integer("routine_day_id").references(() => routineDays.id, {
      onDelete: "set null",
    }),
    notes: text("notes").notNull().default(""),
    durationMin: integer("duration_min"),
    // cardio summary (used when kind = 'cardio')
    distanceKm: real("distance_km"),
    finished: boolean("finished").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("workouts_user_date_idx").on(t.userId, t.date)],
);

export const setLogs = pgTable(
  "set_logs",
  {
    id: serial("id").primaryKey(),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0), // exercise order in workout
    setNumber: integer("set_number").notNull().default(1),
    weightKg: real("weight_kg"),
    reps: integer("reps"),
    rpe: real("rpe"),
    isWarmup: boolean("is_warmup").notNull().default(false),
    done: boolean("done").notNull().default(true),
  },
  (t) => [
    index("set_logs_workout_idx").on(t.workoutId),
    index("set_logs_exercise_idx").on(t.exerciseId),
  ],
);

/* ----------------------------------------------------------- body metrics */

export const bodyMetrics = pgTable(
  "body_metrics",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    weightKg: real("weight_kg"),
    bodyFatPct: real("body_fat_pct"),
    waistCm: real("waist_cm"),
    chestCm: real("chest_cm"),
    armCm: real("arm_cm"),
    thighCm: real("thigh_cm"),
    notes: text("notes").notNull().default(""),
  },
  (t) => [uniqueIndex("body_metrics_user_date_idx").on(t.userId, t.date)],
);

/* -------------------------------------------------------------- nutrition */

export const meals = pgTable(
  "meals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    time: text("time").notNull().default("12:00"), // HH:MM local
    name: text("name").notNull(),
    slot: text("slot").notNull().default("snack"), // breakfast|lunch|dinner|snack
    calories: integer("calories"),
    proteinG: integer("protein_g"),
    carbsG: integer("carbs_g"),
    fatG: integer("fat_g"),
    isJunk: boolean("is_junk").notNull().default(false),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("meals_user_date_idx").on(t.userId, t.date)],
);

export const waterLogs = pgTable(
  "water_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    ml: integer("ml").notNull().default(0),
  },
  (t) => [uniqueIndex("water_logs_user_date_idx").on(t.userId, t.date)],
);

/* ----------------------------------------------------------------- photos */

export const photos = pgTable(
  "photos",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    pose: text("pose").notNull().default("front"), // front | side | back
    dataUrl: text("data_url").notNull(), // compressed JPEG data URL
    weightKg: real("weight_kg"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("photos_user_date_idx").on(t.userId, t.date)],
);

export const photoAnalyses = pgTable("photo_analyses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  photoId: integer("photo_id").references(() => photos.id, { onDelete: "cascade" }),
  comparePhotoId: integer("compare_photo_id").references(() => photos.id, {
    onDelete: "cascade",
  }),
  model: text("model").notNull().default(""),
  summary: text("summary").notNull().default(""),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ notes */

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    mood: integer("mood"), // 1..5
    energy: integer("energy"), // 1..5
    sleepHours: real("sleep_hours"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notes_user_date_idx").on(t.userId, t.date)],
);

/* ---------------------------------------------------------- notifications */

export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("custom"), // gym | meal | water | weigh_in | junk_check | custom
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    timeLocal: text("time_local").notNull().default("18:00"), // HH:MM
    days: text("days").notNull().default("0,1,2,3,4,5,6"), // comma separated dow
    url: text("url").notNull().default("/"),
    enabled: boolean("enabled").notNull().default(true),
    lastSentDate: date("last_sent_date"),
  },
  (t) => [index("reminders_user_idx").on(t.userId)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("push_subs_endpoint_idx").on(t.endpoint)],
);

export type User = typeof users.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type RoutineDay = typeof routineDays.$inferSelect;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type DayOverride = typeof dayOverrides.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type BodyMetric = typeof bodyMetrics.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Note = typeof notes.$inferSelect;
