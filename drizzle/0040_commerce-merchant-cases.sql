CREATE TABLE "commerce"."merchant_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"establishment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reporter_key" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"note" text,
	"moderator_key" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "merchant_cases_kind_valid" CHECK ("commerce"."merchant_cases"."kind" in ('denuncia', 'disputa')),
	CONSTRAINT "merchant_cases_status_valid" CHECK ("commerce"."merchant_cases"."status" in ('pendiente', 'revocado', 'descartado'))
);
--> statement-breakpoint
CREATE INDEX "merchant_cases_establishment_idx" ON "commerce"."merchant_cases" USING btree ("establishment_id");