import { sql } from 'drizzle-orm';
import { check, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const pricingSchema = pgSchema('pricing');

// Reportes de solo inserción: no se actualizan ni se borran; la moderación cambia su estado.
export const reports = pricingSchema.table(
  'reports',
  {
    id: uuid('id').primaryKey(),
    // Sin llaves foráneas: catalog y establishments son de otros esquemas (grill de la #14, pregunta 5).
    presentationId: uuid('presentation_id').notNull(),
    establishmentId: uuid('establishment_id').notNull(),
    // Opcional hasta la #16, que agrega la sesión (pregunta 2). Nunca sale en respuestas ni eventos.
    reporterId: uuid('reporter_id'),
    priceCop: integer('price_cop').notNull(),
    priceType: text('price_type').notNull(),
    status: text('status').notNull().default('recibido'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    // Pregunta 6: la clave y la huella viven con el reporte, sin caducar.
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
  },
  (table) => [
    uniqueIndex('reports_idempotency_key_idx').on(table.idempotencyKey),
    check('reports_price_cop_range', sql`${table.priceCop} between 1 and 10000000`),
    check('reports_price_type_valid', sql`${table.priceType} in ('normal', 'oferta')`),
    check(
      'reports_status_valid',
      sql`${table.status} in ('recibido', 'en_revision', 'vigente', 'descartado')`,
    ),
  ],
);
