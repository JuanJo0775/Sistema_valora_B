CREATE SCHEMA "commerce";
--> statement-breakpoint
CREATE TABLE "commerce"."merchant_claims" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"establishment_id" uuid NOT NULL,
	"responsible_name" text NOT NULL,
	"nit" text,
	"informal" boolean NOT NULL,
	"phone" text NOT NULL,
	"accepted_terms_version" text NOT NULL,
	"status" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "merchant_claims_status_valid" CHECK ("commerce"."merchant_claims"."status" in ('verificado')),
	CONSTRAINT "merchant_claims_informal_without_nit" CHECK ("commerce"."merchant_claims"."informal" = ("commerce"."merchant_claims"."nit" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_claims_establishment_idx" ON "commerce"."merchant_claims" USING btree ("establishment_id");