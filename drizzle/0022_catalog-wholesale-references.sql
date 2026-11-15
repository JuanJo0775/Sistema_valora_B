CREATE TABLE "catalog"."wholesale_references" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"sipsa_name" text NOT NULL,
	"market" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"price_per_kg_cop" integer NOT NULL,
	"source_url" text NOT NULL,
	"responsible" text NOT NULL,
	"consulted_at" date NOT NULL,
	CONSTRAINT "wholesale_references_price_positive" CHECK ("catalog"."wholesale_references"."price_per_kg_cop" > 0),
	CONSTRAINT "wholesale_references_period_valid" CHECK ("catalog"."wholesale_references"."period_start" <= "catalog"."wholesale_references"."period_end")
);
