CREATE TABLE "identity"."external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"account_id" uuid NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "external_identities_provider_valid" CHECK ("identity"."external_identities"."provider" in ('google'))
);
--> statement-breakpoint
ALTER TABLE "identity"."accounts" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."external_identities" ADD CONSTRAINT "external_identities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_provider_subject_idx" ON "identity"."external_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "external_identities_account_idx" ON "identity"."external_identities" USING btree ("account_id");