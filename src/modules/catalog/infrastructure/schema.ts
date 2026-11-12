import { sql } from 'drizzle-orm';
import { boolean, check, integer, numeric, pgSchema, text, uuid } from 'drizzle-orm/pg-core';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const catalog = pgSchema('catalog');

// Lista cerrada de categorías (grill de la #49, preguntas 3 y 4); se carga por migración.
export const categories = catalog.table('categories', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  // ADR-005: la vigencia (TTL) depende de si la categoría es fresca.
  isFresh: boolean('is_fresh').notNull(),
});

export const products = catalog.table('products', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  brand: text('brand'),
  categoryCode: text('category_code')
    .notNull()
    .references(() => categories.code),
});

// Presentación tal como se escribe en el empaque (grill de la #49, pregunta 1).
export const presentations = catalog.table(
  'presentations',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantity: numeric('quantity').notNull(),
    unit: text('unit').notNull(),
    packCount: integer('pack_count').notNull().default(1),
    barcode: text('barcode'),
  },
  (table) => [
    check('presentations_quantity_positive', sql`${table.quantity} > 0`),
    check('presentations_unit_valid', sql`${table.unit} in ('g', 'kg', 'ml', 'l', 'und')`),
    check('presentations_pack_count_positive', sql`${table.packCount} >= 1`),
  ],
);
