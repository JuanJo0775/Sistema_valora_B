import { integer, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  },
  (table) => [primaryKey({ columns: [table.presentationId, table.establishmentId] })],
);
