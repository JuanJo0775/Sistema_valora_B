CREATE TABLE "commerce"."official_price_reviews" (
	"establishment_id" uuid NOT NULL,
	"presentation_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"price_cop" integer NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "official_price_reviews_establishment_id_presentation_id_pk" PRIMARY KEY("establishment_id","presentation_id"),
	CONSTRAINT "official_price_reviews_price_cop_range" CHECK ("commerce"."official_price_reviews"."price_cop" between 100 and 5000000)
);
--> statement-breakpoint
CREATE TABLE "reliability"."official_reviews" (
	"review_id" uuid PRIMARY KEY NOT NULL,
	"presentation_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"reporter_key" text NOT NULL,
	"price_cop" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"state" text,
	CONSTRAINT "official_reviews_state_valid" CHECK ("reliability"."official_reviews"."state" is null or "reliability"."official_reviews"."state" in ('aprobado', 'descartado', 'cerrado'))
);
