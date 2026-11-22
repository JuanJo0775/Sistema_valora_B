CREATE TABLE "comparison"."promotions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"establishment_id" uuid NOT NULL,
	"presentation_id" uuid NOT NULL,
	"offer" jsonb NOT NULL,
	"conditions" jsonb NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL
);
--> statement-breakpoint
CREATE INDEX "promotions_presentation_idx" ON "comparison"."promotions" USING btree ("presentation_id");