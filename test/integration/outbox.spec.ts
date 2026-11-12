import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import type { Database } from '../../src/shared/database/database.module';
import type * as Events from '../../src/shared/events';

// Este archivo prueba el bus por su interfaz pública, contra valora_test.
describe('bus de eventos con outbox', () => {
  let app: INestApplication;
  let db: Database;
  let events: typeof Events;
  let bus: Events.EventBus;
  let publisher: Events.OutboxPublisher;
  let relay: Events.OutboxRelay;

  beforeAll(async () => {
    // Intervalo muy largo: en estas pruebas el repartidor se llama a mano con runOnce().
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '3600000';
    const { AppModule } = await import('../../src/app.module');
    const { DATABASE } = await import('../../src/shared/database/database.module');
    events = await import('../../src/shared/events');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
    bus = app.get(events.EventBus);
    publisher = app.get(events.OutboxPublisher);
    relay = app.get(events.OutboxRelay);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate shared.outbox, shared.processed_events`);
  });

  it('un evento publicado en una transacción confirmada llega al suscriptor con su tipo, versión y datos', async () => {
    const received: Events.DomainEvent[] = [];
    bus.subscribe('receptor-confirmado', 'PrecioDePruebaConfirmado', (event) => {
      received.push(event);
      return Promise.resolve();
    });
    const event = events.createEvent('PrecioDePruebaConfirmado', 1, { priceCop: 4000 });

    await db.transaction(async (tx) => {
      await publisher.publish(tx, event);
    });
    await relay.runOnce();

    expect(received).toEqual([
      expect.objectContaining({
        id: event.id,
        type: 'PrecioDePruebaConfirmado',
        version: 1,
        payload: { priceCop: 4000 },
      }),
    ]);
  });

  it('un evento publicado en una transacción revertida nunca se entrega', async () => {
    const received: Events.DomainEvent[] = [];
    bus.subscribe('receptor-revertido', 'PrecioDePruebaRevertido', (event) => {
      received.push(event);
      return Promise.resolve();
    });

    await expect(
      db.transaction(async (tx) => {
        await publisher.publish(tx, events.createEvent('PrecioDePruebaRevertido', 1, {}));
        throw new Error('falla el cambio que causó el evento');
      }),
    ).rejects.toThrow('falla el cambio');
    await relay.runOnce();

    expect(received).toEqual([]);
  });
});
