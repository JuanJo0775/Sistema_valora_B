CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE TABLE "catalog"."categories" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_fresh" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."presentations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"pack_count" integer DEFAULT 1 NOT NULL,
	"barcode" text,
	CONSTRAINT "presentations_quantity_positive" CHECK ("catalog"."presentations"."quantity" > 0),
	CONSTRAINT "presentations_unit_valid" CHECK ("catalog"."presentations"."unit" in ('g', 'kg', 'ml', 'l', 'und')),
	CONSTRAINT "presentations_pack_count_positive" CHECK ("catalog"."presentations"."pack_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "catalog"."products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"category_code" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog"."presentations" ADD CONSTRAINT "presentations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."products" ADD CONSTRAINT "products_category_code_categories_code_fk" FOREIGN KEY ("category_code") REFERENCES "catalog"."categories"("code") ON DELETE no action ON UPDATE no action;