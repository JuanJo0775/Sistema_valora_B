CREATE TABLE "reliability"."appeals" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reliability"."moderation_log" ADD COLUMN "stage" text DEFAULT 'revision' NOT NULL;--> statement-breakpoint
ALTER TABLE "reliability"."moderation_log" ADD CONSTRAINT "moderation_log_stage_valid" CHECK ("reliability"."moderation_log"."stage" in ('revision', 'apelacion'));