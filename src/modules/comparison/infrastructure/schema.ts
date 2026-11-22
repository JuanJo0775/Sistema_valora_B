import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const comparisonSchema = pgSchema('comparison');

// Modelo de lectura de ADR-004: el precio vigente de cada presentación en cada tienda.
// Se llena con PriceReported; los ids vienen de otros módulos, por eso no hay llaves foráneas.
export const priceCurrent = comparisonSchema.table(
  'price_current',
  {
    presentationId: uuid('presentation_id').notNull(),
    establishmentId: uuid('establishment_id').notNull(),
    reportId: uuid('report_id').notNull(),
    priceCop: integer('price_cop').notNull(),
    priceType: text('price_type').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    // Grill de la #31, pregunta 5: «en_revision» si el único precio de la tienda es sospechoso.
    status: text('status').notNull().default('vigente'),
    // B#135: «comunidad» si lo reportó alguien; «siembra» si es un dato inicial de la semilla.
    source: text('source').notNull().default('comunidad'),
  },
  (table) => [
    primaryKey({ columns: [table.presentationId, table.establishmentId] }),
    check('price_current_status_valid', sql`${table.status} in ('vigente', 'en_revision')`),
    check('price_current_source_valid', sql`${table.source} in ('comunidad', 'siembra')`),
  ],
);

// Grill de la #83, pregunta 1: un precio por reporte, para el historial (RF-008 RN4). Se llena con
// PriceAssessed y PriceWithdrawn; sin datos de quién reportó (EC-08).
export const priceHistory = comparisonSchema.table(
  'price_history',
  {
    reportId: uuid('report_id').primaryKey(),
    presentationId: uuid('presentation_id').notNull(),
    establishmentId: uuid('establishment_id').notNull(),
    priceCop: integer('price_cop').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    // Pregunta 4: solo «cuenta» entra al historial; un sospechoso espera la aprobación.
    status: text('status').notNull(),
  },
  (table) => [
    check(
      'price_history_status_valid',
      sql`${table.status} in ('cuenta', 'sospechoso', 'retirado')`,
    ),
    index('price_history_presentation_idx').on(table.presentationId, table.observedAt),
  ],
);

// D1 y D4 del grill comercial (#204): copia del precio oficial de cada presentación en cada tienda,
// llenada con los eventos de commerce (comparison no importa commerce, EC-05).
export const officialPrices = comparisonSchema.table(
  'official_prices',
  {
    presentationId: uuid('presentation_id').notNull(),
    establishmentId: uuid('establishment_id').notNull(),
    priceCop: integer('price_cop').notNull(),
    // Vigencia del oficial (ADR-005): cuenta desde la última confirmación.
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull(),
    // Última vez que cambió el precio: solo los reportes posteriores corroboran (D1).
    priceChangedAt: timestamp('price_changed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.presentationId, table.establishmentId] }),
    index('official_prices_establishment_idx').on(table.establishmentId),
  ],
);
