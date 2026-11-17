-- Lista inicial de categorías (grill de la issue #49, preguntas 3 y 4), aprobada el 11-nov-2026.
-- is_fresh decide el TTL de la vigencia (ADR-005): 7 días para frescos, 14 para el resto.
-- Para cambiar la lista se escribe una migración nueva; esta no se edita.
INSERT INTO "catalog"."categories" ("code", "name", "is_fresh") VALUES
  ('fruits-vegetables', 'Frutas y verduras', true),
  ('meat-fish', 'Carnes y pescados', true),
  ('dairy-eggs', 'Lácteos y huevos', true),
  ('bakery', 'Panadería', true),
  ('grains-groceries', 'Granos y abarrotes', false),
  ('beverages', 'Bebidas', false),
  ('household-cleaning', 'Aseo del hogar', false),
  ('personal-care', 'Cuidado personal', false);
