CREATE TABLE "comparison"."price_history" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"presentation_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"price_cop" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "price_history_status_valid" CHECK ("comparison"."price_history"."status" in ('cuenta', 'sospechoso', 'retirado'))
);
--> statement-breakpoint
CREATE INDEX "price_history_presentation_idx" ON "comparison"."price_history" USING btree ("presentation_id","observed_at");