CREATE TABLE "catalog"."product_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"category_code" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"pack_count" integer NOT NULL,
	"barcode" text,
	"requester_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"merge_into" uuid,
	"note" text,
	"moderator_key" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "product_requests_quantity_positive" CHECK ("catalog"."product_requests"."quantity" > 0),
	CONSTRAINT "product_requests_unit_valid" CHECK ("catalog"."product_requests"."unit" in ('g', 'kg', 'ml', 'l', 'und')),
	CONSTRAINT "product_requests_pack_count_positive" CHECK ("catalog"."product_requests"."pack_count" >= 1),
	CONSTRAINT "product_requests_status_valid" CHECK ("catalog"."product_requests"."status" in ('pendiente', 'aprobada', 'fusionada', 'rechazada'))
);
--> statement-breakpoint
ALTER TABLE "catalog"."product_requests" ADD CONSTRAINT "product_requests_category_code_categories_code_fk" FOREIGN KEY ("category_code") REFERENCES "catalog"."categories"("code") ON DELETE no action ON UPDATE no action;