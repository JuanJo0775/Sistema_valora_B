CREATE TABLE "identity"."password_resets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "identity"."password_resets" ADD CONSTRAINT "password_resets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_hash_idx" ON "identity"."password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_pending_idx" ON "identity"."password_resets" USING btree ("account_id") WHERE used_at is null;