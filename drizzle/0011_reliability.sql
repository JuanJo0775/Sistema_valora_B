CREATE SCHEMA "reliability";
--> statement-breakpoint
CREATE TABLE "reliability"."observations" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"presentation_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"reporter_key" text NOT NULL,
	"reporter_since" date NOT NULL,
	"price_cop" integer NOT NULL,
	"price_type" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"verdict" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reliability"."reputation_events" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"reporter_key" text NOT NULL,
	"event" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reliability"."reputations" (
	"reporter_key" text PRIMARY KEY NOT NULL,
	"value" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "observations_place_idx" ON "reliability"."observations" USING btree ("presentation_id","establishment_id");