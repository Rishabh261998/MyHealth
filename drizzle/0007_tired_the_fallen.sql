CREATE TABLE "custom_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"exercise_id" integer,
	"period" text DEFAULT 'week' NOT NULL,
	"calc" text DEFAULT 'avg' NOT NULL,
	"range_days" integer DEFAULT 90 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_metrics" ADD CONSTRAINT "custom_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_metrics" ADD CONSTRAINT "custom_metrics_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_metrics_user_idx" ON "custom_metrics" USING btree ("user_id");