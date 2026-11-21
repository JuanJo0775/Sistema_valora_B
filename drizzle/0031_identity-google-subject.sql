ALTER TABLE "identity"."accounts" ADD COLUMN "google_subject" text;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_google_subject_idx" ON "identity"."accounts" USING btree ("google_subject");