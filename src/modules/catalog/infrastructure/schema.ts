import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const catalog = pgSchema('catalog');

// Lista cerrada de categorías (grill de la #49, preguntas 3 y 4); se carga por migración.
export const categories = catalog.table('categories', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  // ADR-005: la vigencia (TTL) depende de si la categoría es fresca.
  isFresh: boolean('is_fresh').notNull(),
});

export const products = catalog.table(
  'products',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    brand: text('brand'),
    categoryCode: text('category_code')
      .notNull()
      .references(() => categories.code),
    // Grill de la #26, pregunta 1 (ADR-020): enlace a la imagen, con su fuente y atribución.
    imageUrl: text('image_url'),
    imageSource: text('image_source'),
    imageAttribution: text('image_attribution'),
  },
  (table) => [
    check(
      'products_image_source_valid',
      sql`${table.imageSource} is null or ${table.imageSource} in ('open_food_facts', 'equipo')`,
    ),
  ],
);

// Grill de la #26, pregunta 2: otros nombres del producto, para la búsqueda.
export const productAliases = catalog.table(
  'product_aliases',
  {
    // Sin llave foránea: los productos no se borran (la semilla no borra, grill de la #51).
    productId: uuid('product_id').notNull(),
    alias: text('alias').notNull(),
  },
  (table) => [primaryKey({ columns: [table.productId, table.alias] })],
);

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
    // RF-003 RN2: un código de barras pertenece a una sola presentación (grill de la #49, pregunta 6).
    uniqueIndex('presentations_barcode_unique').on(table.barcode),
  ],
);
