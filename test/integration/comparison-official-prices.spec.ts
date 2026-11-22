import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import type { Database } from '../../src/shared/database/database.module';
import type * as Events from '../../src/shared/events';

// Presentaciones y tiendas de prueba: solo existen dentro de esta prueba.
const presentationId = 'c3111111-1111-4111-8111-111111111111';
const otherPresentation = 'c3111111-1111-4111-8111-222222222222';
const establishmentId = 'c3222222-2222-4222-8222-222222222222';
const otherStore = 'c3222222-2222-4222-8222-333333333333';

interface Copy {
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  confirmedAt: string;
  priceChangedAt: string;
}

// D1 y D4 del grill comercial (#204): comparison guarda su copia del oficial con los eventos de
// commerce, sin importar commerce (regla nucleo-no-conoce-commerce).
describe('copia del precio oficial en comparison (#204)', () => {
  let app: INestApplication;
  let db: Database;
  let events: typeof Events;

  beforeAll(async () => {
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '3600000';
    const { AppModule } = await import('../../src/app.module');
    const { DATABASE } = await import('../../src/shared/database/database.module');
    events = await import('../../src/shared/events');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate comparison.official_prices, shared.outbox, shared.processed_events`,
    );
  });

  const deliver = async (type: string, payload: Record<string, unknown>): Promise<void> => {
    const event = events.createEvent(type, 1, payload);
    await db.transaction((tx) => app.get(events.OutboxPublisher).publish(tx, event));
    await app.get(events.OutboxRelay).runOnce();
  };
  const publish = (
    priceCop: number,
    confirmedAt: string,
    at = { presentationId, establishmentId },
  ) => deliver('OfficialPricePublished', { ...at, priceCop, confirmedAt });
  const copies = async (): Promise<Copy[]> =>
    (
      await db.execute<{
        presentation_id: string;
        establishment_id: string;
        price_cop: number;
        confirmed_at: Date;
        price_changed_at: Date;
      }>(sql`select * from comparison.official_prices order by establishment_id, presentation_id`)
    ).rows.map((row) => ({
      presentationId: row.presentation_id,
      establishmentId: row.establishment_id,
      priceCop: row.price_cop,
      confirmedAt: new Date(row.confirmed_at).toISOString(),
      priceChangedAt: new Date(row.price_changed_at).toISOString(),
    }));

  it('un oficial publicado queda con su precio, su confirmación y la fecha de su cambio', async () => {
    await publish(4000, '2026-11-22T10:00:00.000Z');

    await expect(copies()).resolves.toEqual([
      {
        presentationId,
        establishmentId,
        priceCop: 4000,
        confirmedAt: '2026-11-22T10:00:00.000Z',
        priceChangedAt: '2026-11-22T10:00:00.000Z',
      },
    ]);
  });

  it('publicar el mismo precio lo reconfirma sin mover la fecha del cambio; otro precio sí la mueve', async () => {
    await publish(4000, '2026-11-22T10:00:00.000Z');
    await publish(4000, '2026-11-25T10:00:00.000Z');

    await expect(copies()).resolves.toMatchObject([
      { confirmedAt: '2026-11-25T10:00:00.000Z', priceChangedAt: '2026-11-22T10:00:00.000Z' },
    ]);

    await publish(4500, '2026-11-26T10:00:00.000Z');

    await expect(copies()).resolves.toMatchObject([
      {
        priceCop: 4500,
        confirmedAt: '2026-11-26T10:00:00.000Z',
        priceChangedAt: '2026-11-26T10:00:00.000Z',
      },
    ]);
  });

  it('«Todos mis precios siguen igual» reconfirma los de esa tienda, sin mover el cambio', async () => {
    await publish(4000, '2026-11-22T10:00:00.000Z');
    await publish(9000, '2026-11-22T10:00:00.000Z', {
      presentationId: otherPresentation,
      establishmentId,
    });
    await publish(4100, '2026-11-22T10:00:00.000Z', {
      presentationId,
      establishmentId: otherStore,
    });

    await deliver('OfficialPricesReconfirmed', {
      establishmentId,
      confirmedAt: '2026-11-29T10:00:00.000Z',
    });

    const result = await copies();
    expect(result.map((c) => [c.establishmentId, c.confirmedAt, c.priceChangedAt])).toEqual([
      [establishmentId, '2026-11-29T10:00:00.000Z', '2026-11-22T10:00:00.000Z'],
      [establishmentId, '2026-11-29T10:00:00.000Z', '2026-11-22T10:00:00.000Z'],
      [otherStore, '2026-11-22T10:00:00.000Z', '2026-11-22T10:00:00.000Z'],
    ]);
  });

  // D3 (#208): al revocar el comercio o borrar su cuenta, el oficial deja de mostrarse.
  it('un oficial retirado desaparece de la copia; los de otras tiendas siguen', async () => {
    await publish(4000, '2026-11-22T10:00:00.000Z');
    await publish(4100, '2026-11-22T10:00:00.000Z', {
      presentationId,
      establishmentId: otherStore,
    });

    await deliver('OfficialPriceWithdrawn', { establishmentId, presentationId });

    expect((await copies()).map((c) => c.establishmentId)).toEqual([otherStore]);
  });
});
