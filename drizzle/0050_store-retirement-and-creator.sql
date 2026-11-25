ALTER TABLE "commerce"."merchant_claims" ADD COLUMN "created_establishment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "establishments"."establishments" ADD COLUMN "status" text DEFAULT 'activa' NOT NULL;--> statement-breakpoint
ALTER TABLE "establishments"."establishments" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "establishments"."establishments" ADD CONSTRAINT "establishments_status_valid" CHECK ("establishments"."establishments"."status" in ('activa', 'retirada'));