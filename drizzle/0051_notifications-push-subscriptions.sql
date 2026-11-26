CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE TABLE "notifications"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE INDEX "push_subscriptions_account_idx" ON "notifications"."push_subscriptions" USING btree ("account_id","created_at");