CREATE SCHEMA IF NOT EXISTS "imports";--> statement-breakpoint
CREATE TABLE "imports"."online_observations" (
	"source" text NOT NULL,
	"zone_id" text NOT NULL,
	"presentation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"ean" text NOT NULL,
	"sku_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"status" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"price_cop" bigint,
	CONSTRAINT "online_observations_source_zone_id_presentation_id_run_id_pk" PRIMARY KEY("source","zone_id","presentation_id","run_id"),
	CONSTRAINT "online_observations_valid_status" CHECK ((
    ("imports"."online_observations"."status" = 'available' and "imports"."online_observations"."price_cop" is not null and "imports"."online_observations"."price_cop" > 0 and "imports"."online_observations"."expires_at" is not null and "imports"."online_observations"."expires_at" > "imports"."online_observations"."observed_at")
    or ("imports"."online_observations"."status" = 'unavailable' and "imports"."online_observations"."price_cop" is null and "imports"."online_observations"."expires_at" is null)
  ))
);
--> statement-breakpoint
CREATE INDEX "online_observations_latest_idx" ON "imports"."online_observations" USING btree ("source","zone_id","presentation_id","observed_at" DESC NULLS LAST,"run_id" DESC NULLS LAST);