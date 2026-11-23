CREATE TABLE "commerce"."promotions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"establishment_id" uuid NOT NULL,
	"presentation_id" uuid NOT NULL,
	"offer" jsonb NOT NULL,
	"conditions" jsonb NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "promotions_dates_order" CHECK ("commerce"."promotions"."valid_until" >= "commerce"."promotions"."valid_from")
);
--> statement-breakpoint
CREATE INDEX "promotions_establishment_idx" ON "commerce"."promotions" USING btree ("establishment_id");