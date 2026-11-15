import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
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

// Grill de la #26, pregunta 3: propuestas de productos, pendientes de moderación (RF-003 RN3).
export const productRequests = catalog.table(
  'product_requests',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    brand: text('brand'),
    categoryCode: text('category_code')
      .notNull()
      .references(() => categories.code),
    quantity: numeric('quantity').notNull(),
    unit: text('unit').notNull(),
    packCount: integer('pack_count').notNull(),
    barcode: text('barcode'),
    // Clave seudónima de quien lo propone (EC-08).
    requesterKey: text('requester_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pendiente'),
    mergeInto: uuid('merge_into'),
    note: text('note'),
    moderatorKey: text('moderator_key'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    check('product_requests_quantity_positive', sql`${table.quantity} > 0`),
    check('product_requests_unit_valid', sql`${table.unit} in ('g', 'kg', 'ml', 'l', 'und')`),
    check('product_requests_pack_count_positive', sql`${table.packCount} >= 1`),
    check(
      'product_requests_status_valid',
      sql`${table.status} in ('pendiente', 'aprobada', 'fusionada', 'rechazada')`,
    ),
  ],
);

// Grill de la #34 (RF-014): precio mayorista de SIPSA por kilo, como referencia pública (RN3). Lo carga
// la semilla a mano (RN1, ADR-011). Sin llave foránea, como los alias: los productos no se borran.
export const wholesaleReferences = catalog.table(
  'wholesale_references',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id').notNull(),
    sipsaName: text('sipsa_name').notNull(),
    market: text('market').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    pricePerKgCop: integer('price_per_kg_cop').notNull(),
    sourceUrl: text('source_url').notNull(),
    // RF-014 RN5: trazabilidad de la carga.
    responsible: text('responsible').notNull(),
    consultedAt: date('consulted_at', { mode: 'string' }).notNull(),
  },
  (table) => [
    check('wholesale_references_price_positive', sql`${table.pricePerKgCop} > 0`),
    check('wholesale_references_period_valid', sql`${table.periodStart} <= ${table.periodEnd}`),
  ],
);
