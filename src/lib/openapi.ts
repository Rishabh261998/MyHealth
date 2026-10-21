/**
 * OpenAPI 3.1 description of the /api/v1 REST API, served at
 * /api/v1/openapi.json. Keep it in step with src/app/api/v1/[[...path]]/route.ts.
 */

const date = { type: "string", format: "date", example: "2026-10-21" } as const;
const nullableNumber = { type: ["number", "null"] } as const;
const nullableInteger = { type: ["integer", "null"] } as const;

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const ok = (description: string, schema: object) => ({
  description,
  content: { "application/json": { schema } },
});

const jsonBody = (schema: object) => ({
  required: true,
  content: { "application/json": { schema } },
});

const readErrors = {
  "401": errorResponse("Not signed in and no valid API key."),
  "403": errorResponse("The API key lacks the 'read' scope."),
};

const writeErrors = {
  "400": errorResponse("The body is not valid JSON or fails validation."),
  "401": errorResponse("Not signed in and no valid API key."),
  "403": errorResponse("The API key lacks the 'write' scope."),
};

export function openApiSpec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "MyHealth API",
      version: "1.0.0",
      description:
        "Read and log the signed-in user's own training, nutrition, body and recovery data. " +
        "Every call acts on one user's data only: the signed-in user (session cookie) or the owner of the API key. " +
        "Weights are stored in kilograms; `GET /me` says which unit (lb or kg) the user prefers to see.",
    },
    servers: [{ url: origin }],
    security: [{ session: [] }, { bearerKey: [] }, { headerKey: [] }],
    paths: {
      "/api/v1/me": {
        get: {
          operationId: "getProfile",
          summary: "Get the user's profile and goals",
          description: "Name, email, timezone, preferred weight unit and daily goals.",
          responses: { "200": ok("The profile.", { $ref: "#/components/schemas/Profile" }), ...readErrors },
        },
      },
      "/api/v1/summary": {
        get: {
          operationId: "getTodaySummary",
          summary: "Get today's snapshot",
          description:
            "Today's nutrition totals, water against the goal, the planned training session, the workout streak and the latest body weight.",
          responses: { "200": ok("Today's snapshot.", { $ref: "#/components/schemas/Summary" }), ...readErrors },
        },
      },
      "/api/v1/workouts": {
        get: {
          operationId: "listRecentWorkouts",
          summary: "List recent workouts",
          description: "The most recent workouts, newest first, with set counts and training volume.",
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              description: "How many workouts to return (1-100, default 20).",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            "200": ok("Recent workouts.", {
              type: "object",
              properties: { workouts: { type: "array", items: { $ref: "#/components/schemas/Workout" } } },
              required: ["workouts"],
            }),
            ...readErrors,
          },
        },
      },
      "/api/v1/body": {
        get: {
          operationId: "listBodyMetrics",
          summary: "List body-metric history",
          description: "Weight, body fat and measurements by day, oldest first.",
          parameters: [
            {
              name: "since",
              in: "query",
              required: false,
              description: "First date to include (YYYY-MM-DD). Defaults to 90 days ago.",
              schema: date,
            },
          ],
          responses: {
            "200": ok("Body metrics.", {
              type: "object",
              properties: {
                since: date,
                metrics: { type: "array", items: { $ref: "#/components/schemas/BodyMetric" } },
              },
              required: ["since", "metrics"],
            }),
            ...readErrors,
          },
        },
        post: {
          operationId: "logBodyMetrics",
          summary: "Log body weight and measurements",
          description:
            "Add or replace one day's body metrics. Give the weight in either kilograms (weightKg) or pounds (weightLb). Replaces any metrics already logged for that date.",
          requestBody: jsonBody({
            type: "object",
            properties: {
              date: { ...date, description: "Defaults to today in the user's timezone." },
              weightKg: { type: "number", exclusiveMinimum: 0 },
              weightLb: { type: "number", exclusiveMinimum: 0 },
              bodyFatPct: { type: "number", minimum: 0, maximum: 100 },
              waistCm: { type: "number", exclusiveMinimum: 0 },
              chestCm: { type: "number", exclusiveMinimum: 0 },
              armCm: { type: "number", exclusiveMinimum: 0 },
              thighCm: { type: "number", exclusiveMinimum: 0 },
              notes: { type: "string", maxLength: 2000 },
            },
            additionalProperties: false,
          }),
          responses: {
            "201": ok("Saved.", {
              type: "object",
              properties: { ok: { type: "boolean" }, date },
              required: ["ok", "date"],
            }),
            ...writeErrors,
          },
        },
      },
      "/api/v1/nutrition": {
        get: {
          operationId: "getDayNutrition",
          summary: "Get a day's meals and totals",
          parameters: [
            {
              name: "date",
              in: "query",
              required: false,
              description: "The day (YYYY-MM-DD). Defaults to today in the user's timezone.",
              schema: date,
            },
          ],
          responses: {
            "200": ok("The day's nutrition.", {
              type: "object",
              properties: {
                date,
                totals: { $ref: "#/components/schemas/NutritionTotals" },
                meals: { type: "array", items: { $ref: "#/components/schemas/Meal" } },
              },
              required: ["date", "totals", "meals"],
            }),
            ...readErrors,
          },
        },
      },
      "/api/v1/meals": {
        post: {
          operationId: "logMeal",
          summary: "Log a meal",
          description: "Adds a meal. Macros are whole grams; calories are kcal.",
          requestBody: jsonBody({
            type: "object",
            properties: {
              name: { type: "string", minLength: 1, maxLength: 200, example: "Chicken rice bowl" },
              date: { ...date, description: "Defaults to today in the user's timezone." },
              time: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "HH:MM, local time. Defaults to 12:00.", example: "13:30" },
              slot: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], default: "snack" },
              calories: { type: "integer", minimum: 0 },
              proteinG: { type: "integer", minimum: 0 },
              carbsG: { type: "integer", minimum: 0 },
              fatG: { type: "integer", minimum: 0 },
              isJunk: { type: "boolean", default: false, description: "Counts toward the weekly junk-meal limit." },
              notes: { type: "string", maxLength: 2000 },
            },
            required: ["name"],
            additionalProperties: false,
          }),
          responses: {
            "201": ok("Logged.", {
              type: "object",
              properties: { ok: { type: "boolean" }, id: { type: "integer" } },
              required: ["ok", "id"],
            }),
            ...writeErrors,
          },
        },
      },
      "/api/v1/water": {
        post: {
          operationId: "addWater",
          summary: "Add water",
          description: "Adds ml to the day's water total (a negative number subtracts; the total never goes below 0).",
          requestBody: jsonBody({
            type: "object",
            properties: {
              date: { ...date, description: "Defaults to today in the user's timezone." },
              ml: { type: "integer", example: 250 },
            },
            required: ["ml"],
            additionalProperties: false,
          }),
          responses: {
            "201": ok("Added.", {
              type: "object",
              properties: { ok: { type: "boolean" }, date, totalMl: { type: "integer" } },
              required: ["ok", "date", "totalMl"],
            }),
            ...writeErrors,
          },
        },
      },
      "/api/v1/recovery": {
        get: {
          operationId: "listRecovery",
          summary: "List sleep, HRV and readiness history",
          parameters: [
            {
              name: "since",
              in: "query",
              required: false,
              description: "First date to include (YYYY-MM-DD). Defaults to 30 days ago.",
              schema: date,
            },
          ],
          responses: {
            "200": ok("Recovery by day.", {
              type: "object",
              properties: {
                since: date,
                days: { type: "array", items: { $ref: "#/components/schemas/RecoveryDay" } },
              },
              required: ["since", "days"],
            }),
            ...readErrors,
          },
        },
        post: {
          operationId: "logRecovery",
          summary: "Log a day's recovery data",
          description: "Adds or replaces one day's sleep and recovery numbers. Needs a date and at least one metric.",
          requestBody: jsonBody({
            type: "object",
            properties: {
              date,
              sleepHours: { type: "number", exclusiveMinimum: 0 },
              sleepScore: { type: "integer", minimum: 0, maximum: 100 },
              restingHr: { type: "integer", exclusiveMinimum: 0, description: "Beats per minute." },
              hrv: { type: "integer", exclusiveMinimum: 0, description: "Heart-rate variability in ms." },
              readiness: { type: "integer", minimum: 0, maximum: 100 },
              steps: { type: "integer", exclusiveMinimum: 0 },
              activeKcal: { type: "integer", exclusiveMinimum: 0 },
            },
            required: ["date"],
          }),
          responses: {
            "201": ok("Saved.", {
              type: "object",
              properties: { ok: { type: "boolean" }, date },
              required: ["ok", "date"],
            }),
            ...writeErrors,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          name: "myhealth_session",
          description: "The signed-in user's session, sent automatically by the browser on this site.",
        },
        bearerKey: {
          type: "http",
          scheme: "bearer",
          description: "A personal API key from More → Developer / API.",
        },
        headerKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
          required: ["error"],
        },
        Profile: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            email: { type: "string" },
            timezone: { type: "string", example: "Asia/Kolkata" },
            unit: { type: "string", enum: ["lb", "kg"] },
            goals: {
              type: "object",
              properties: {
                targetWeightKg: nullableNumber,
                dailyCalories: nullableInteger,
                dailyProteinG: nullableInteger,
                dailyWaterMl: nullableInteger,
                weeklyJunkLimit: nullableInteger,
              },
            },
          },
        },
        NutritionTotals: {
          type: "object",
          properties: {
            calories: { type: "integer" },
            protein: { type: "integer", description: "Grams." },
            carbs: { type: "integer", description: "Grams." },
            fat: { type: "integer", description: "Grams." },
            junk: { type: "integer", description: "Junk meals that day." },
            count: { type: "integer", description: "Meals logged." },
            waterMl: { type: "integer" },
          },
        },
        Summary: {
          type: "object",
          properties: {
            date,
            nutrition: { $ref: "#/components/schemas/NutritionTotals" },
            water: {
              type: "object",
              properties: { ml: { type: "integer" }, goalMl: nullableInteger },
            },
            plannedSession: {
              type: ["object", "null"],
              properties: {
                label: { type: "string", example: "Push A" },
                kind: { type: "string", enum: ["strength", "cardio", "rest"] },
              },
            },
            workoutStreakDays: { type: "integer" },
            latestWeightKg: nullableNumber,
          },
        },
        Workout: {
          type: "object",
          properties: {
            id: { type: "integer" },
            date,
            label: { type: "string" },
            kind: { type: "string", enum: ["strength", "cardio"] },
            finished: { type: "boolean" },
            durationMin: nullableInteger,
            distanceKm: nullableNumber,
            sets: { type: "integer", description: "Sets recorded." },
            volume: { type: "number", description: "Total kg × reps of completed working sets." },
          },
        },
        BodyMetric: {
          type: "object",
          properties: {
            id: { type: "integer" },
            date,
            weightKg: nullableNumber,
            bodyFatPct: nullableNumber,
            waistCm: nullableNumber,
            chestCm: nullableNumber,
            armCm: nullableNumber,
            thighCm: nullableNumber,
            notes: { type: "string" },
          },
        },
        Meal: {
          type: "object",
          properties: {
            id: { type: "integer" },
            date,
            time: { type: "string", example: "13:30" },
            name: { type: "string" },
            slot: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
            calories: nullableInteger,
            proteinG: nullableInteger,
            carbsG: nullableInteger,
            fatG: nullableInteger,
            isJunk: { type: "boolean" },
            notes: { type: "string" },
          },
        },
        RecoveryDay: {
          type: "object",
          properties: {
            date,
            sleep_hours: nullableNumber,
            sleep_score: nullableInteger,
            resting_hr: nullableInteger,
            hrv_ms: nullableInteger,
            readiness: nullableInteger,
            steps: nullableInteger,
            active_kcal: nullableInteger,
          },
        },
      },
    },
  };
}
