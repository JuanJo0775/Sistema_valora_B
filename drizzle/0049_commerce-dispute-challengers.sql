CREATE TABLE "commerce"."dispute_challengers" (
	"case_id" uuid PRIMARY KEY NOT NULL,
	"establishment_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"responsible_name" text NOT NULL,
	"nit" text,
	"phone" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dispute_challengers_account_idx" ON "commerce"."dispute_challengers" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "dispute_challengers_establishment_idx" ON "commerce"."dispute_challengers" USING btree ("establishment_id");