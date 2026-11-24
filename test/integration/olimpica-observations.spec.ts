import { randomUUID } from 'node:crypto';
import { openTestDatabase } from '../support/test-database';
import { OlimpicaObservations } from '../../src/modules/imports/infrastructure/olimpica-observations';
import type { OnlineObservation } from '../../src/modules/imports/application/apply-olimpica';

const { pool, db } = openTestDatabase();
const observations = new OlimpicaObservations(db);
afterAll(() => pool.end());

const first = new Date('2026-11-24T10:00:00Z');

function available(presentationId: string, observedAt = first): OnlineObservation {
  return {
    source: 'olimpica_vtex',
    presentationId,
    zoneId: 'armenia-piloto',
    runId: randomUUID(),
    ean: '7702552000097',
    status: 'available',
    observedAt,
    expiresAt: new Date(observedAt.getTime() + 48 * 60 * 60 * 1000),
    priceCop: 1950,
    skuId: '516338',
    sellerId: 'v1',
  };
}

it('el reintento devuelve el dato guardado y una observación tardía no lo reemplaza', async () => {
  const id = randomUUID();
  const newest = available(id, new Date('2026-11-24T11:00:00Z'));
  await observations.save(newest);
  const replay = await observations.save({ ...newest, priceCop: 3500 });
  expect(replay).toEqual(newest);
  await observations.save(available(id));
  await expect(observations.latest(id, newest.zoneId)).resolves.toEqual(newest);
});

it('retira al confirmar indisponibilidad y vence exactamente en 48 horas al reactivar', async () => {
  const id = randomUUID();
  const original = available(id);
  await observations.save(original);
  const { priceCop: _price, expiresAt: _expiry, ...identity } = original;
  await observations.save({
    ...identity,
    runId: randomUUID(),
    status: 'unavailable',
    observedAt: new Date('2026-11-24T11:00:00Z'),
  });
  await expect(
    observations.current(id, original.zoneId, new Date('2026-11-24T11:00:00Z')),
  ).resolves.toBeNull();
  const restored = available(id, new Date('2026-11-24T12:00:00Z'));
  await observations.save(restored);
  await expect(
    observations.current(id, original.zoneId, new Date('2026-11-26T11:59:59.999Z')),
  ).resolves.toEqual(restored);
  await expect(
    observations.current(id, original.zoneId, new Date('2026-11-26T12:00:00Z')),
  ).resolves.toBeNull();
});
