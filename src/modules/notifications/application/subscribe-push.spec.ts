import type { NewPushSubscription, PushSubscriptionRepository } from './push-subscriptions';
import { MAX_SUBSCRIPTIONS_PER_ACCOUNT, SubscribePush } from './subscribe-push';

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

  it('guarda como máximo 5 dispositivos por cuenta y reemplaza el más antiguo', async () => {
    const { subscriptions, subscribe } = setup();
    for (let n = 1; n <= MAX_SUBSCRIPTIONS_PER_ACCOUNT; n += 1) {
      await subscribe.execute({ accountId: 'moderadora', ...device(n) });
    }

    await subscribe.execute({ accountId: 'moderadora', ...device(6) });

    const kept = await subscriptions.endpointsOf('moderadora');
    expect(MAX_SUBSCRIPTIONS_PER_ACCOUNT).toBe(5);
    expect(kept).toHaveLength(5);
    expect(kept).not.toContain(device(1).endpoint);
    expect(kept).toContain(device(6).endpoint);
  });

  // Pruebas de resguardo: ya pasan con la regla del máximo; evitan que un cambio futuro saque a un
  // dispositivo por error.
  it('reactivar un dispositivo de una cuenta que ya tiene 5 no saca a ninguno', async () => {
    const { subscriptions, subscribe } = setup();
    for (let n = 1; n <= MAX_SUBSCRIPTIONS_PER_ACCOUNT; n += 1) {
      await subscribe.execute({ accountId: 'moderadora', ...device(n) });
    }

    await subscribe.execute({ accountId: 'moderadora', ...device(3) });

    expect(await subscriptions.endpointsOf('moderadora')).toHaveLength(5);
    expect(await subscriptions.endpointsOf('moderadora')).toContain(device(1).endpoint);
  });

  it('el límite es por cuenta: los dispositivos de otra cuenta no cuentan', async () => {
    const { subscriptions, subscribe } = setup();
    for (let n = 1; n <= MAX_SUBSCRIPTIONS_PER_ACCOUNT; n += 1) {
      await subscribe.execute({ accountId: 'moderadora', ...device(n) });
    }

    await subscribe.execute({ accountId: 'comercio', ...device(7) });

    expect(await subscriptions.endpointsOf('moderadora')).toHaveLength(5);
    expect(await subscriptions.endpointsOf('comercio')).toEqual([device(7).endpoint]);
  });

  it('activar de nuevo el mismo dispositivo no lo duplica y renueva sus claves', async () => {
    const { subscriptions, subscribe } = setup();
    await subscribe.execute({ accountId: 'moderadora', ...device(1) });

    await subscribe.execute({ accountId: 'moderadora', ...device(1), auth: 'secreto-nuevo' });

    expect(await subscriptions.endpointsOf('moderadora')).toHaveLength(1);
    expect(subscriptions.rows.get(device(1).endpoint)?.auth).toBe('secreto-nuevo');
  });
});
