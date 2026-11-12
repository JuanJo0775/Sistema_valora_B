CREATE SCHEMA "pricing";
--> statement-breakpoint
CREATE TABLE "pricing"."reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"presentation_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"reporter_id" uuid,
	"price_cop" integer NOT NULL,
	"price_type" text NOT NULL,
	"status" text DEFAULT 'recibido' NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	CONSTRAINT "reports_price_cop_range" CHECK ("pricing"."reports"."price_cop" between 1 and 10000000),
	CONSTRAINT "reports_price_type_valid" CHECK ("pricing"."reports"."price_type" in ('normal', 'oferta')),
	CONSTRAINT "reports_status_valid" CHECK ("pricing"."reports"."status" in ('recibido', 'en_revision', 'vigente', 'descartado'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reports_idempotency_key_idx" ON "pricing"."reports" USING btree ("idempotency_key");