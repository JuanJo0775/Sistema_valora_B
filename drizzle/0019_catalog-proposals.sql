CREATE TABLE "catalog"."product_aliases" (
	"product_id" uuid NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "product_aliases_product_id_alias_pk" PRIMARY KEY("product_id","alias")
);
--> statement-breakpoint
ALTER TABLE "catalog"."products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "catalog"."products" ADD COLUMN "image_source" text;--> statement-breakpoint
ALTER TABLE "catalog"."products" ADD COLUMN "image_attribution" text;--> statement-breakpoint
ALTER TABLE "catalog"."products" ADD CONSTRAINT "products_image_source_valid" CHECK ("catalog"."products"."image_source" is null or "catalog"."products"."image_source" in ('open_food_facts', 'equipo'));