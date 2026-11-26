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
});
