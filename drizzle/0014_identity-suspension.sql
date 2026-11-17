ALTER TABLE "identity"."accounts" ADD COLUMN "reporter_key" text;--> statement-breakpoint
ALTER TABLE "identity"."accounts" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_reporter_key_idx" ON "identity"."accounts" USING btree ("reporter_key");