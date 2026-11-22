CREATE TABLE "establishments"."store_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text,
	"location" geography(Point, 4326),
	"proposer_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"note" text,
	"moderator_key" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "store_corrections_status_valid" CHECK ("establishments"."store_corrections"."status" in ('pendiente', 'aprobada', 'rechazada')),
	CONSTRAINT "store_corrections_has_change" CHECK ("establishments"."store_corrections"."name" is not null or "establishments"."store_corrections"."location" is not null)
);
--> statement-breakpoint
ALTER TABLE "establishments"."establishments" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "establishments"."establishments" ADD COLUMN "phone" text;