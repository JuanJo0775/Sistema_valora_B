import { sql } from 'drizzle-orm';
import { check, index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const identitySchema = pgSchema('identity');

export const accounts = identitySchema.table(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    // Sin espacios y en minúsculas (grill de la #16, pregunta 7).
    email: text('email').notNull(),
    // #133: el nombre visible; vacío en las cuentas creadas antes. Solo lo ve la propia cuenta.
    displayName: text('display_name'),
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
    // ADR-029: cuándo verificó el correo (nulo = sin verificar). Registrar precios lo exige.
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    // ADR-032: cuándo se borra la cuenta de forma definitiva (nulo = no hay eliminación pendiente). La
    // purga solo borra las que ya cumplieron la fecha; nunca se adelanta.
    deletionScheduledFor: timestamp('deletion_scheduled_for', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('accounts_email_idx').on(table.email),
    uniqueIndex('accounts_reporter_key_idx').on(table.reporterKey),
    index('accounts_deletion_due_idx')
      .on(table.deletionScheduledFor)
      .where(sql`deletion_scheduled_for is not null`),
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

// Grill de la #73, pregunta 3 (RF-002 RN4): quién cambió qué rol, cuándo y por qué. Un trigger de la
// migración rechaza UPDATE y DELETE. Sin llave foránea: la bitácora debe sobrevivir aunque una cuenta
// se borre (derecho de supresión, Ley 1581). changed_by vacío significa «sistema».
export const roleChanges = identitySchema.table(
  'role_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull(),
    fromRole: text('from_role').notNull(),
    toRole: text('to_role').notNull(),
    changedBy: uuid('changed_by'),
    note: text('note').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'role_changes_roles_valid',
      sql`${table.fromRole} in ('reportante', 'comercio', 'moderador') and ${table.toRole} in ('reportante', 'comercio', 'moderador')`,
    ),
  ],
);

// ADR-029: enlaces de verificación de correo. Se guarda el hash SHA-256 del token, nunca el token (como
// las sesiones). Vive en identity: el correo y lo que lo comprueba no salen de este módulo (EC-08).
export const emailVerifications = identitySchema.table(
  'email_verifications',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('email_verifications_token_hash_idx').on(table.tokenHash),
    // Un solo enlace vigente (sin usar) por cuenta.
    uniqueIndex('email_verifications_pending_idx')
      .on(table.accountId)
      .where(sql`used_at is null`),
  ],
);
