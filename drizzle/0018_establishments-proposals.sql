CREATE TABLE "establishments"."store_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"address" text,
	"location" geography(Point, 4326) NOT NULL,
	"proposer_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"merge_into" uuid,
	"note" text,
	"moderator_key" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "store_proposals_type_valid" CHECK ("establishments"."store_proposals"."type" in ('barrio', 'minimercado', 'supermercado', 'descuento')),
	CONSTRAINT "store_proposals_status_valid" CHECK ("establishments"."store_proposals"."status" in ('pendiente', 'aprobada', 'fusionada', 'rechazada'))
);
