import { sql } from 'drizzle-orm';
import { check, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const identitySchema = pgSchema('identity');

export const accounts = identitySchema.table(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    // Sin espacios y en minúsculas (grill de la #16, pregunta 7).
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    // Consentimiento de datos (RF-001, Ley 1581).
    policyVersion: text('policy_version').notNull(),
    policyAcceptedAt: timestamp('policy_accepted_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Grill de la #33, pregunta 3: la clave seudónima, para encontrar la cuenta que reliability
    // solo conoce por ella. Pregunta 4: hasta cuándo está suspendida.
    reporterKey: text('reporter_key'),
    suspendedUntil: timestamp('suspended_until', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('accounts_email_idx').on(table.email),
    uniqueIndex('accounts_reporter_key_idx').on(table.reporterKey),
    check('accounts_role_valid', sql`${table.role} in ('reportante', 'comercio', 'moderador')`),
  ],
);

// Pregunta 2: la sesión vive en el servidor; se guarda el hash del token, nunca el token.
export const sessions = identitySchema.table(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('sessions_token_hash_idx').on(table.tokenHash)],
);
