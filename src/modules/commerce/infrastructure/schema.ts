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
    // Precisión de D3 (#208): rechazada (su tienda propuesta no se aprobó) o revocada por un moderador.
    outcome: text('outcome').notNull().default('rechazado'),
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

// ADR-037: un precio oficial sin referencia con la que compararlo espera aquí la decisión de
// moderación. No es oficial ni vigente: comparison no lo conoce hasta que se apruebe. Uno por tienda
// y presentación: enviar otro precio reemplaza al anterior.
export const officialPriceReviews = commerceSchema.table(
  'official_price_reviews',
  {
    establishmentId: uuid('establishment_id').notNull(),
    presentationId: uuid('presentation_id').notNull(),
    // Une esta fila con el caso de la cola de moderación (reliability); una decisión vieja no aplica.
    reviewId: uuid('review_id').notNull(),
    priceCop: integer('price_cop').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.establishmentId, table.presentationId] }),
    check('official_price_reviews_price_cop_range', sql`${table.priceCop} between 100 and 5000000`),
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

// D2 y D3 (#208): denuncias y disputas que decide el moderador. Solo la clave seudónima de quien las
// abre (EC-08); la decisión queda anotada (quién, cuándo y por qué).
export const merchantCases = commerceSchema.table(
  'merchant_cases',
  {
    id: uuid('id').primaryKey(),
    establishmentId: uuid('establishment_id').notNull(),
    kind: text('kind').notNull(),
    reporterKey: text('reporter_key').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pendiente'),
    note: text('note'),
    moderatorKey: text('moderator_key'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    index('merchant_cases_establishment_idx').on(table.establishmentId),
    check('merchant_cases_kind_valid', sql`${table.kind} in ('denuncia', 'disputa', 'reclamo')`),
    check(
      'merchant_cases_status_valid',
      sql`${table.status} in ('pendiente', 'revocado', 'descartado', 'aprobado', 'rechazado')`,
    ),
  ],
);

// H18: los datos del responsable de quien disputa, solo mientras su caso está pendiente (se borran al
// decidirlo y al eliminar la cuenta). La cuenta sirve para ese borrado y nunca sale en respuestas.
export const disputeChallengers = commerceSchema.table(
  'dispute_challengers',
  {
    caseId: uuid('case_id').primaryKey(),
    establishmentId: uuid('establishment_id').notNull(),
    accountId: uuid('account_id').notNull(),
    responsibleName: text('responsible_name').notNull(),
    nit: text('nit'),
    phone: text('phone').notNull(),
  },
  (table) => [
    index('dispute_challengers_account_idx').on(table.accountId),
    index('dispute_challengers_establishment_idx').on(table.establishmentId),
  ],
);

// B9 (#209): lo ya avisado por correo a cada comercio (un aviso por clave) y el día del correo, para
// no repetirlo. Se borra con la cuenta (ADR-032).
export const merchantNotices = commerceSchema.table(
  'merchant_notices',
  {
    accountId: uuid('account_id').notNull(),
    key: text('key').notNull(),
    notifiedOn: date('notified_on', { mode: 'string' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.key] }),
    index('merchant_notices_day_idx').on(table.accountId, table.notifiedOn),
  ],
);
