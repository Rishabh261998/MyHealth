CREATE TABLE "recovery_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"sleep_hours" real,
	"sleep_score" integer,
	"resting_hr" integer,
	"hrv_ms" integer,
	"readiness" integer,
	"steps" integer,
	"active_kcal" integer,
	"raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wearable_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ingest_token" text;--> statement-breakpoint
ALTER TABLE "recovery_metrics" ADD CONSTRAINT "recovery_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wearable_connections" ADD CONSTRAINT "wearable_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_user_date_source_idx" ON "recovery_metrics" USING btree ("user_id","date","source");--> statement-breakpoint
CREATE UNIQUE INDEX "wearable_conn_user_source_idx" ON "wearable_connections" USING btree ("user_id","source");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ingest_token_unique" UNIQUE("ingest_token");