-- Búsqueda de productos sin tildes ni mayúsculas (RF-003 RN4, grill de la issue #52).
-- unaccent y pg_trgm son extensiones «de confianza» en PostgreSQL 17: el dueño de la base puede crearlas.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Nombre y marca juntos, sin tildes y en minúsculas. IMMUTABLE (con el diccionario fijo) para poder indexarla.
CREATE OR REPLACE FUNCTION "catalog"."search_text"(name text, brand text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(name, '') || ' ' || coalesce(brand, '')))
$$;
--> statement-breakpoint
-- Índice de trigramas: acelera LIKE '%palabra%' y la medida de parecido.
CREATE INDEX "products_search_text_trgm_idx" ON "catalog"."products"
  USING gin ("catalog"."search_text"("name", "brand") gin_trgm_ops);
