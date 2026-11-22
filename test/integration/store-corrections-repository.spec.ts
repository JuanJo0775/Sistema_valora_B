import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { OpeningHours } from '../../src/domain/opening-hours';
import type { StoreCorrection } from '../../src/modules/establishments/application/store-details';
import { DrizzleEstablishmentImportRepository } from '../../src/modules/establishments/infrastructure/drizzle-establishment-import-repository';
import { DrizzleEstablishmentRepository } from '../../src/modules/establishments/infrastructure/drizzle-establishment-repository';
import { DrizzleStoreCorrectionRepository } from '../../src/modules/establishments/infrastructure/drizzle-store-correction-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

const storeId = 'c8111111-1111-4111-8111-111111111111';
const day = { opens: '07:00', closes: '20:00' };
const hours: OpeningHours = {
  lunes: day,
  martes: day,
  miercoles: day,
  jueves: day,
  viernes: day,
  sabado: day,
  domingo: null,
};
const correction: StoreCorrection = {
  id: 'c8222222-2222-4222-8222-222222222222',
  establishmentId: storeId,
  name: 'Tienda El Sol',
  location: { lat: 4.534, lng: -75.6812 },
  proposerKey: 'a'.repeat(64),
  createdAt: new Date('2026-11-22T15:00:00Z'),
};
const decision = {
  note: 'Verificada con la foto de la fachada',
  moderatorKey: 'c'.repeat(64),
  decidedAt: new Date('2026-11-23T12:00:00Z'),
};

describe('datos y correcciones de una tienda (D5, #207)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let stores: DrizzleEstablishmentRepository;
  let corrections: DrizzleStoreCorrectionRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    stores = new DrizzleEstablishmentRepository(db);
    corrections = new DrizzleStoreCorrectionRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate establishments.establishments, establishments.store_corrections`);
    await new DrizzleEstablishmentImportRepository(db).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      lat: 4.5339,
      lng: -75.6811,
    });
  });

  it('aplica el horario, el teléfono y el nombre de la tienda', async () => {
    await stores.applyDetails(storeId, {
      openingHours: hours,
      phone: '6067441234',
      name: 'Tienda Rosa',
    });

    await expect(stores.contactOf(storeId)).resolves.toEqual({
      openingHours: hours,
      phone: '6067441234',
    });
    await expect(stores.findById(storeId)).resolves.toMatchObject({ name: 'Tienda Rosa' });
    // Sin cambios no hace nada.
    await stores.applyDetails(storeId, {});
  });

  it('una corrección queda pendiente sin cambiar la tienda; aprobarla aplica el nombre y la ubicación', async () => {
    await corrections.propose(correction);

    await expect(corrections.pending()).resolves.toEqual([correction]);
    await expect(stores.findById(storeId)).resolves.toMatchObject({ name: 'Tienda La Esperanza' });

    await expect(
      corrections.decide({ correctionId: correction.id, decision: 'aprobar', ...decision }),
    ).resolves.toEqual(correction);

    await expect(corrections.pending()).resolves.toEqual([]);
    await expect(stores.findById(storeId)).resolves.toMatchObject({
      name: 'Tienda El Sol',
      lat: 4.534,
      lng: -75.6812,
    });
    // Ya decidida, no se decide otra vez.
    await expect(
      corrections.decide({ correctionId: correction.id, decision: 'rechazar', ...decision }),
    ).resolves.toBeNull();
  });

  it('rechazarla no cambia la tienda', async () => {
    await corrections.propose(correction);

    await corrections.decide({ correctionId: correction.id, decision: 'rechazar', ...decision });

    await expect(stores.findById(storeId)).resolves.toMatchObject({
      name: 'Tienda La Esperanza',
      lat: 4.5339,
    });
  });
});
