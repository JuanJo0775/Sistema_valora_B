CREATE SCHEMA "establishments";
--> statement-breakpoint
CREATE TABLE "establishments"."establishments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"address" text,
	"location" geography(Point, 4326) NOT NULL,
	CONSTRAINT "establishments_type_valid" CHECK ("establishments"."establishments"."type" in ('barrio', 'minimercado', 'supermercado', 'descuento'))
);
--> statement-breakpoint
CREATE INDEX "establishments_location_idx" ON "establishments"."establishments" USING gist ("location");