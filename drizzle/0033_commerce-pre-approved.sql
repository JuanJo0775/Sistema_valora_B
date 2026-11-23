ALTER TABLE "commerce"."merchant_claims" DROP CONSTRAINT "merchant_claims_status_valid";--> statement-breakpoint
ALTER TABLE "commerce"."merchant_claims" ALTER COLUMN "verified_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce"."merchant_claims" ADD CONSTRAINT "merchant_claims_status_valid" CHECK ("commerce"."merchant_claims"."status" in ('pre_aprobado', 'verificado'));