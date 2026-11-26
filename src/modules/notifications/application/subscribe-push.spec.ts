import type { NewPushSubscription, PushSubscriptionRepository } from './push-subscriptions';
import { SubscribePush } from './subscribe-push';

// Repositorio en memoria con el mismo contrato que el real: una dirección tiene un solo dueño y
// activar de nuevo renueva las claves y la fecha.
class InMemorySubscriptions implements PushSubscriptionRepository {
  rows = new Map<string, NewPushSubscription>();

  save(subscription: NewPushSubscription): Promise<void> {
    this.rows.set(subscription.endpoint, subscription);
    return Promise.resolve();
  }

  endpointsOf(accountId: string): Promise<string[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.accountId === accountId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => row.endpoint),
    );
  }

  remove(accountId: string, endpoints: string[]): Promise<void> {
    for (const endpoint of endpoints) {
      if (this.rows.get(endpoint)?.accountId === accountId) this.rows.delete(endpoint);
    }
    return Promise.resolve();
  }
}

const device = (n: number) => ({
  endpoint: `https://push.example.net/dispositivo-${String(n)}`,
  p256dh: `clave-publica-del-dispositivo-${String(n)}`,
  auth: `secreto-${String(n)}`,
});

// Un reloj que avanza un minuto en cada lectura, para que «el más antiguo» sea el primero en activarse.
function setup() {
  const subscriptions = new InMemorySubscriptions();
  let minute = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 10, 25, 20, (minute += 1))) };
  return { subscriptions, subscribe: new SubscribePush({ subscriptions, clock }) };
}

describe('activar los avisos en un dispositivo (ADR-045)', () => {
  it('guarda la suscripción del dispositivo a nombre de la cuenta que la activó', async () => {
    const { subscriptions, subscribe } = setup();

    await subscribe.execute({ accountId: 'moderadora', ...device(1) });

    expect(await subscriptions.endpointsOf('moderadora')).toEqual([device(1).endpoint]);
    expect(subscriptions.rows.get(device(1).endpoint)).toMatchObject({
      accountId: 'moderadora',
      p256dh: device(1).p256dh,
      auth: device(1).auth,
    });
  });
});
