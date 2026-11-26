import { sql } from 'drizzle-orm';
import { DrizzlePushSubscriptions } from '../../src/modules/notifications/infrastructure/drizzle-push-subscriptions';
import { openTestDatabase } from '../support/test-database';

const { pool, db } = openTestDatabase();
const subscriptions = new DrizzlePushSubscriptions(db);

// Las cuentas son UUID (identity).
const CUENTA_A = 'a1000000-0000-4000-8000-000000000001';
const CUENTA_B = 'a1000000-0000-4000-8000-000000000002';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 20, minute));
const device = (n: number, accountId = CUENTA_A, minute = n) => ({
  accountId,
  endpoint: `https://push.example.net/dispositivo-${String(n)}`,
  p256dh: `clave-publica-${String(n)}`,
  auth: `secreto-${String(n)}`,
  createdAt: at(minute),
});

beforeEach(async () => {
  await db.execute(sql`truncate notifications.push_subscriptions`);
});
afterAll(() => pool.end());

describe('suscripciones push en la base (ADR-045)', () => {
  it('guarda las direcciones de una cuenta y las lista de la más antigua a la más nueva', async () => {
    await subscriptions.save(device(2));
    await subscriptions.save(device(1));
    await subscriptions.save(device(3, CUENTA_B));

    await expect(subscriptions.endpointsOf(CUENTA_A)).resolves.toEqual([
      device(1).endpoint,
      device(2).endpoint,
    ]);
  });

  // Pruebas de resguardo del contrato del repositorio: ya pasan con el upsert por dirección.
  it('activar de nuevo la misma dirección la renueva y no la duplica', async () => {
    await subscriptions.save(device(1));
    await subscriptions.save({ ...device(1), auth: 'secreto-nuevo', createdAt: at(30) });

    await expect(subscriptions.endpointsOf(CUENTA_A)).resolves.toEqual([device(1).endpoint]);
    const rows = await db.execute(sql`select auth from notifications.push_subscriptions`);
    expect(rows.rows).toEqual([{ auth: 'secreto-nuevo' }]);
  });

  // EC-08: si otra cuenta activa los avisos desde el mismo navegador, la cuenta anterior deja de
  // recibir avisos ahí; un aviso de moderación no puede llegar al navegador de otra persona.
  it('una dirección pasa a la última cuenta que la activó', async () => {
    await subscriptions.save(device(1, CUENTA_A));
    await subscriptions.save({ ...device(1, CUENTA_B), createdAt: at(10) });

    await expect(subscriptions.endpointsOf(CUENTA_A)).resolves.toEqual([]);
    await expect(subscriptions.endpointsOf(CUENTA_B)).resolves.toEqual([device(1).endpoint]);
  });

  it('borrar solo borra las direcciones de esa cuenta', async () => {
    await subscriptions.save(device(1, CUENTA_A));
    await subscriptions.save(device(2, CUENTA_B));

    await subscriptions.remove(CUENTA_A, [device(1).endpoint, device(2).endpoint]);

    await expect(subscriptions.endpointsOf(CUENTA_A)).resolves.toEqual([]);
    await expect(subscriptions.endpointsOf(CUENTA_B)).resolves.toEqual([device(2).endpoint]);
  });
});
