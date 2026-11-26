import { index, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

// ADR-044: cuándo se avisó por última vez a cada cuenta por cada cola. Sostiene el límite de un aviso
// cada 5 minutos y evita duplicados si el outbox reintenta. Sin llaves foráneas (la cuenta es de
// identity) y sin ningún otro dato.
export const sentNotices = notificationsSchema.table(
  'sent_notices',
  {
    accountId: uuid('account_id').notNull(),
    queue: text('queue').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.queue] })],
);
