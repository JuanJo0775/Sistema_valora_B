import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { PromotionOffer } from '../../../domain/promotion';
import type { PromotionConditions } from '../application/promotions';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const commerceSchema = pgSchema('commerce');

// D2 y D3 del grill comercial: la cuenta dueña de cada tienda. Sin llaves foráneas: identity y
// establishments son de otros esquemas. Nunca se guarda la ubicación del celular (EC-08).
export const merchantClaims = commerceSchema.table(
  'merchant_claims',
  {
    accountId: uuid('account_id').primaryKey(),
    establishmentId: uuid('establishment_id').notNull(),
    responsibleName: text('responsible_name').notNull(),
    nit: text('nit'),
    informal: boolean('informal').notNull(),
    phone: text('phone').notNull(),
    acceptedTermsVersion: text('accepted_terms_version').notNull(),
    status: text('status').notNull(),
    // null mientras está pre-aprobado (D2).
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (table) => [
    // D3: un dueño por tienda. La llave primaria ya deja una tienda por cuenta.
    uniqueIndex('merchant_claims_establishment_idx').on(table.establishmentId),
    check('merchant_claims_status_valid', sql`${table.status} in ('pre_aprobado', 'verificado')`),
    check('merchant_claims_informal_without_nit', sql`${table.informal} = (${table.nit} is null)`),
  ],
);

// D2: solicitudes cerradas porque su tienda propuesta no se aprobó. Salen de merchant_claims para que
// la cuenta pueda registrar otra tienda, y quedan aquí con el motivo.
export const merchantClaimRejections = commerceSchema.table(
  'merchant_claim_rejections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull(),
    establishmentId: uuid('establishment_id').notNull(),
    reason: text('reason').notNull(),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('merchant_claim_rejections_account_idx').on(table.accountId, table.rejectedAt)],
);

// RF-016 con la D4 del grill comercial: un precio oficial por tienda y presentación. Sin llaves
// foráneas: establishments y catalog son de otros esquemas.
export const officialPrices = commerceSchema.table(
  'official_prices',
  {
    establishmentId: uuid('establishment_id').notNull(),
    presentationId: uuid('presentation_id').notNull(),
    priceCop: integer('price_cop').notNull(),
    // La vigencia cuenta desde aquí (ADR-005); editar o reconfirmar la mueve.
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull(),
    // Primera publicación: solo ordena la lista del comercio.
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.establishmentId, table.presentationId] }),
    // ADR-030: el mismo piso y techo absolutos que un reporte.
    check('official_prices_price_cop_range', sql`${table.priceCop} between 100 and 5000000`),
  ],
);

// RF-017 con la D6 del grill comercial: las promociones de cada tienda. La oferta y las condiciones
// tienen formas fijas (sin texto libre) que valida la capa de aplicación; se guardan como JSON.
export const promotions = commerceSchema.table(
  'promotions',
  {
    id: uuid('id').primaryKey(),
    establishmentId: uuid('establishment_id').notNull(),
    presentationId: uuid('presentation_id').notNull(),
    offer: jsonb('offer').$type<PromotionOffer>().notNull(),
    conditions: jsonb('conditions').$type<PromotionConditions>().notNull(),
    // Fechas de Colombia, las dos incluidas.
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validUntil: date('valid_until', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('promotions_establishment_idx').on(table.establishmentId),
    check('promotions_dates_order', sql`${table.validUntil} >= ${table.validFrom}`),
  ],
);
