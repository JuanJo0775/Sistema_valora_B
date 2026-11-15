import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
    // Grill de la #32, pregunta 4: aprobado o descartado; null mientras no haya decisión.
    moderation: text('moderation'),
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

// Grill de la #32, pregunta 5: una marca por cuenta y reporte (RN1 de RF-013).
export const flags = reliabilitySchema.table(
  'flags',
  {
    reportId: uuid('report_id').notNull(),
    flaggerKey: text('flagger_key').notNull(),
    reason: text('reason').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.flaggerKey] }),
    check(
      'flags_reason_valid',
      sql`${table.reason} in ('precio_falso', 'producto_equivocado', 'establecimiento_equivocado', 'otro')`,
    ),
  ],
);

// Bitácora inmutable de decisiones: un trigger de la migración rechaza UPDATE y DELETE (pregunta 5).
export const moderationLog = reliabilitySchema.table(
  'moderation_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id').notNull(),
    decision: text('decision').notNull(),
    note: text('note').notNull(),
    moderatorKey: text('moderator_key').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'moderation_log_decision_valid',
      sql`${table.decision} in ('aprobar', 'descartar', 'observar_cuentas')`,
    ),
  ],
);
