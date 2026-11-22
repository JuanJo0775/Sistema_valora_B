import { sql } from 'drizzle-orm';
import { boolean, check, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // D3: un dueño por tienda. La llave primaria ya deja una tienda por cuenta.
    uniqueIndex('merchant_claims_establishment_idx').on(table.establishmentId),
    check('merchant_claims_status_valid', sql`${table.status} in ('verificado')`),
    check('merchant_claims_informal_without_nit', sql`${table.informal} = (${table.nit} is null)`),
  ],
);
