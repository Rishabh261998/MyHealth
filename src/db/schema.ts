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
  // Leaderboards — private by default. A user only appears on the public board
  // if they opt in; friends are always mutual and explicit.
  shareCode: text("share_code").unique(),
  publicLeaderboard: boolean("public_leaderboard").notNull().default(false),
  // Secret token for the wearable ingest webhook (Apple Watch via Shortcuts, etc.)
  ingestToken: text("ingest_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------- friendships */

/**
 * A mutual connection. Adding someone by their share code writes both
 * directions, so friendship is always symmetric and always consented to by
 * both people (you need their code; they keep yours).
 */
export const friendships = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: integer("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("friendships_pair_idx").on(t.userId, t.friendId)],
);

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

/* --------------------------------------------------------------- api keys */

/**
 * A personal API key so third-party services and scripts can read and write
 * this user's own data. Only a SHA-256 hash of the key is stored; the plaintext
 * is shown once at creation. `scopes` is a comma list of "read" and/or "write".
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("API key"),
    prefix: text("prefix").notNull(), // shown for identification, e.g. mh_1a2b3c4d
    keyHash: text("key_hash").notNull().unique(),
    scopes: text("scopes").notNull().default("read"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

/* ----------------------------------------------------- recovery / wearables */

/**
 * One day of recovery data from one source. Keyed by (user, date, source) so
 * an Oura reading and an Apple Watch reading for the same day coexist and the
 * app can prefer whichever is present. Every field is nullable — sources report
 * different subsets.
 */
export const recoveryMetrics = pgTable(
  "recovery_metrics",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    source: text("source").notNull().default("manual"), // oura | whoop | apple | manual | ingest
    sleepHours: real("sleep_hours"),
    sleepScore: integer("sleep_score"), // 0-100
    restingHr: integer("resting_hr"), // bpm
    hrvMs: integer("hrv_ms"), // ms
    readiness: integer("readiness"), // 0-100 (Oura readiness / Whoop recovery)
    steps: integer("steps"),
    activeKcal: integer("active_kcal"),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("recovery_user_date_source_idx").on(t.userId, t.date, t.source)],
);

/**
 * A link to a third-party service the app pulls from (currently Oura). Stores
 * the access token and the outcome of the last sync so failures are visible
 * rather than silent.
 */
export const wearableConnections = pgTable(
  "wearable_connections",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // oura | whoop
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"), // ok | error
    lastSyncMessage: text("last_sync_message").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("wearable_conn_user_source_idx").on(t.userId, t.source)],
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
export type Friendship = typeof friendships.$inferSelect;
export type RecoveryMetric = typeof recoveryMetrics.$inferSelect;
export type WearableConnection = typeof wearableConnections.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
