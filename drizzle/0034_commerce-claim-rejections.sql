CREATE TABLE "commerce"."merchant_claim_rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"rejected_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "merchant_claim_rejections_account_idx" ON "commerce"."merchant_claim_rejections" USING btree ("account_id","rejected_at");