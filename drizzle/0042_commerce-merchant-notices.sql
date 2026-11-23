CREATE TABLE "commerce"."merchant_notices" (
	"account_id" uuid NOT NULL,
	"key" text NOT NULL,
	"notified_on" date NOT NULL,
	CONSTRAINT "merchant_notices_account_id_key_pk" PRIMARY KEY("account_id","key")
);
--> statement-breakpoint
CREATE INDEX "merchant_notices_day_idx" ON "commerce"."merchant_notices" USING btree ("account_id","notified_on");