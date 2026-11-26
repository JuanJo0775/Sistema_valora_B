import type { NewPushSubscription, PushSubscriptionRepository } from './push-subscriptions';
import { UnsubscribePush } from './unsubscribe-push';

// Repositorio en memoria con el contrato del real: borrar solo toca lo de esa cuenta.
class InMemorySubscriptions implements PushSubscriptionRepository {
  constructor(readonly rows: NewPushSubscription[] = []) {}

  save(subscription: NewPushSubscription): Promise<void> {
    this.rows.push(subscription);
    return Promise.resolve();
  }

  endpointsOf(accountId: string): Promise<string[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.accountId === accountId).map((row) => row.endpoint),
    );
  }

  remove(accountId: string, endpoints: string[]): Promise<void> {
    const keep = this.rows.filter(
      (row) => !(row.accountId === accountId && endpoints.includes(row.endpoint)),
    );
    this.rows.splice(0, this.rows.length, ...keep);
    return Promise.resolve();
  }
}

const row = (accountId: string, endpoint: string): NewPushSubscription => ({
  accountId,
  endpoint,
  p256dh: 'clave-publica-de-prueba',
  auth: 'secreto-de-prueba',
  createdAt: new Date('2026-11-25T20:00:00Z'),
});

describe('desactivar los avisos en un dispositivo (ADR-045)', () => {
  it('borra la suscripción de ese dispositivo y deja los demás de la cuenta', async () => {
    const subscriptions = new InMemorySubscriptions([
      row('moderadora', 'https://push.example.net/telefono'),
      row('moderadora', 'https://push.example.net/computador'),
    ]);

    await new UnsubscribePush({ subscriptions }).execute({
      accountId: 'moderadora',
      endpoint: 'https://push.example.net/telefono',
    });

    expect(await subscriptions.endpointsOf('moderadora')).toEqual([
      'https://push.example.net/computador',
    ]);
  });
});
