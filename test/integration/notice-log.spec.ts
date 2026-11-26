import { sql } from 'drizzle-orm';
import { DrizzleNoticeLog } from '../../src/modules/notifications/infrastructure/drizzle-notice-log';
import { openTestDatabase } from '../support/test-database';

const { pool, db } = openTestDatabase();
const log = new DrizzleNoticeLog(db);

// Las cuentas son UUID (identity).
const CUENTA_A = 'b1000000-0000-4000-8000-000000000001';
const CUENTA_B = 'b1000000-0000-4000-8000-000000000002';
const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 20, minute));

beforeEach(async () => {
  await db.execute(sql`truncate notifications.sent_notices`);
});
afterAll(() => pool.end());

describe('registro de avisos enviados (ADR-044)', () => {
  it('no hay constancia de una cuenta a la que nunca se avisó', async () => {
    await expect(log.lastSent(CUENTA_A, 'precios')).resolves.toBeNull();
  });

  it('guarda cuándo se avisó por última vez a cada cuenta y cola', async () => {
    await log.record(CUENTA_A, 'precios', at(1));
    await log.record(CUENTA_B, 'precios', at(2));

    await expect(log.lastSent(CUENTA_A, 'precios')).resolves.toEqual(at(1));
    await expect(log.lastSent(CUENTA_B, 'precios')).resolves.toEqual(at(2));
    await expect(log.lastSent(CUENTA_A, 'tiendas')).resolves.toBeNull();
  });

  it('avisar de nuevo reemplaza la fecha anterior y no duplica la fila', async () => {
    await log.record(CUENTA_A, 'precios', at(1));
    await log.record(CUENTA_A, 'precios', at(10));

    await expect(log.lastSent(CUENTA_A, 'precios')).resolves.toEqual(at(10));
    const rows = await db.execute(sql`select 1 from notifications.sent_notices`);
    expect(rows.rows).toHaveLength(1);
  });
});
