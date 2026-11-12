CREATE SCHEMA "comparison";
--> statement-breakpoint
CREATE TABLE "comparison"."price_current" (
	"presentation_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"price_cop" integer NOT NULL,
	"price_type" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "price_current_presentation_id_establishment_id_pk" PRIMARY KEY("presentation_id","establishment_id")
);
