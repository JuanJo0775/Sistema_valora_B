import { index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const notificationsSchema = pgSchema('notifications');

// ADR-045: un dispositivo que recibe avisos. Sin llaves foráneas (la cuenta es de identity, otro
// esquema). Solo lo necesario para enviar: sin agente de usuario, sin IP, sin ubicación (EC-08).
// La dirección (endpoint) es única: pertenece a una sola cuenta, la última que la activó.
export const pushSubscriptions = notificationsSchema.table(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('push_subscriptions_account_idx').on(table.accountId, table.createdAt)],
);
