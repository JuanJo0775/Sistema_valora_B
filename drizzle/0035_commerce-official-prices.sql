CREATE TABLE "commerce"."official_prices" (
	"establishment_id" uuid NOT NULL,
	"presentation_id" uuid NOT NULL,
	"price_cop" integer NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "official_prices_establishment_id_presentation_id_pk" PRIMARY KEY("establishment_id","presentation_id"),
	CONSTRAINT "official_prices_price_cop_range" CHECK ("commerce"."official_prices"."price_cop" between 100 and 5000000)
);
