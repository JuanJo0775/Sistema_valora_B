CREATE TABLE "identity"."email_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "identity"."accounts" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity"."email_verifications" ADD CONSTRAINT "email_verifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_verifications_token_hash_idx" ON "identity"."email_verifications" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "email_verifications_pending_idx" ON "identity"."email_verifications" USING btree ("account_id") WHERE used_at is null;