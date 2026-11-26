import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createEvent, type OutboxPublisher } from '../../../shared/events';
import { MERCHANT_ALERTS_RAISED } from '../application/send-merchant-digests';

// #260: publica MerchantAlertsRaised por el outbox (ADR-015), solo con el id de la cuenta.
export class DrizzleMerchantAlertEvents {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  async raise(accountId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.outbox.publish(tx, createEvent(MERCHANT_ALERTS_RAISED, 1, { accountId }));
    });
  }
}
