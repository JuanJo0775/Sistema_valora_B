import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const imports = pgSchema('imports');

export const onlineObservations = imports.table(
  'online_observations',
  {
    source: text('source').$type<'olimpica_vtex'>().notNull(),
    zoneId: text('zone_id').notNull(),
    presentationId: uuid('presentation_id').notNull(),
    runId: uuid('run_id').notNull(),
    ean: text('ean').notNull(),
    skuId: text('sku_id').notNull(),
    sellerId: text('seller_id').notNull(),
    status: text('status').$type<'available' | 'unavailable'>().notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    priceCop: bigint('price_cop', { mode: 'number' }),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.zoneId, t.presentationId, t.runId] }),
    index('online_observations_latest_idx').on(
      t.source,
      t.zoneId,
      t.presentationId,
      t.observedAt.desc(),
      t.runId.desc(),
    ),
    check(
      'online_observations_valid_status',
      sql`(
    (${t.status} = 'available' and ${t.priceCop} is not null and ${t.priceCop} > 0 and ${t.expiresAt} is not null and ${t.expiresAt} > ${t.observedAt})
    or (${t.status} = 'unavailable' and ${t.priceCop} is null and ${t.expiresAt} is null)
  )`,
    ),
  ],
);
