import { and, asc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  NewPushSubscription,
  PushSubscriptionRepository,
} from '../application/push-subscriptions';
import type { PushDevice } from '../application/push-sender';
import { pushSubscriptions } from './schema';

export class DrizzlePushSubscriptions implements PushSubscriptionRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async save(subscription: NewPushSubscription): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values(subscription)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          accountId: subscription.accountId,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          createdAt: subscription.createdAt,
        },
      });
  }

  async endpointsOf(accountId: string): Promise<string[]> {
    const rows = await this.db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.accountId, accountId))
      .orderBy(asc(pushSubscriptions.createdAt));
    return rows.map((row) => row.endpoint);
  }

  // Para enviar un aviso hace falta la dirección y las dos claves de cada dispositivo (ADR-045).
  async devicesOf(accountId: string): Promise<PushDevice[]> {
    return this.db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.accountId, accountId))
      .orderBy(asc(pushSubscriptions.createdAt));
  }

  async remove(accountId: string, endpoints: string[]): Promise<void> {
    if (endpoints.length === 0) return;
    await this.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.accountId, accountId),
          inArray(pushSubscriptions.endpoint, endpoints),
        ),
      );
  }

  // ADR-032: al eliminar la cuenta no queda ningún dispositivo suyo.
  async removeAll(accountId: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.accountId, accountId));
  }
}
