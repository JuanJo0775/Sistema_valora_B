CREATE TABLE "comparison"."official_prices" (
	"presentation_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"price_cop" integer NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"price_changed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "official_prices_presentation_id_establishment_id_pk" PRIMARY KEY("presentation_id","establishment_id")
);
--> statement-breakpoint
CREATE INDEX "official_prices_establishment_idx" ON "comparison"."official_prices" USING btree ("establishment_id");