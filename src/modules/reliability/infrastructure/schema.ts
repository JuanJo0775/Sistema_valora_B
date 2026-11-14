import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnomalyResult } from '../../../domain/anomaly';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const reliabilitySchema = pgSchema('reliability');

// Grill de la #31, pregunta 3: copia de cada PriceReported con su veredicto. Solo inserción; la
// moderación (#32) cambiará su estado, nunca la borrará. Sin datos que identifiquen al reportante.
export const observations = reliabilitySchema.table(
  'observations',
  {
    reportId: uuid('report_id').primaryKey(),
    presentationId: uuid('presentation_id').notNull(),
    establishmentId: uuid('establishment_id').notNull(),
    reporterKey: text('reporter_key').notNull(),
    reporterSince: date('reporter_since', { mode: 'date' }).notNull(),
    priceCop: integer('price_cop').notNull(),
    priceType: text('price_type').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    verdict: jsonb('verdict').$type<AnomalyResult>().notNull(),
  },
  (table) => [index('observations_place_idx').on(table.presentationId, table.establishmentId)],
);

// Reputación por clave seudónima; sin fila, la reputación es la neutra.
export const reputations = reliabilitySchema.table('reputations', {
  reporterKey: text('reporter_key').primaryKey(),
  value: doublePrecision('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Pregunta 8: una fila por reporte que ya dio su punto de reputación (y bitácora del cambio).
export const reputationEvents = reliabilitySchema.table('reputation_events', {
  reportId: uuid('report_id').primaryKey(),
  reporterKey: text('reporter_key').notNull(),
  event: text('event').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
