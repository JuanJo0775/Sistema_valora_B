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

  it('un evento pendiente se entrega aunque la app se reinicie antes de repartirlo', async () => {
    const event = events.createEvent('PrecioDePruebaReinicio', 1, { priceCop: 2500 });
    await db.transaction(async (tx) => {
      await publisher.publish(tx, event);
    });

    // «Reinicio»: una instancia nueva de la app, con su propio bus y su propio repartidor.
    const { AppModule } = await import('../../src/app.module');
    const restartedRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const restarted = restartedRef.createNestApplication({ logger: false });
    await restarted.init();
    const received: Events.DomainEvent[] = [];
    restarted.get(events.EventBus).subscribe('receptor-reinicio', 'PrecioDePruebaReinicio', (e) => {
      received.push(e);
      return Promise.resolve();
    });
    await restarted.get(events.OutboxRelay).runOnce();
    await restarted.close();

    expect(received.map((e) => e.id)).toEqual([event.id]);
  });

  it('un evento repetido no se procesa dos veces para el mismo receptor', async () => {
    let calls = 0;
    bus.subscribe('receptor-repetido', 'PrecioDePruebaRepetido', () => {
      calls += 1;
      return Promise.resolve();
    });
    const event = events.createEvent('PrecioDePruebaRepetido', 1, {});

    // Entrega «al menos una vez»: el repartidor puede caerse después de entregar y antes de marcar.
    await bus.deliver(event);
    await bus.deliver(event);

    expect(calls).toBe(1);
  });

  it('si el suscriptor falla, el evento queda pendiente con el error y se reintenta en la siguiente revisión', async () => {
    let calls = 0;
    bus.subscribe('receptor-que-falla-una-vez', 'PrecioDePruebaReintento', () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('reliability no disponible'))
        : Promise.resolve();
    });
    const event = events.createEvent('PrecioDePruebaReintento', 1, {});
    await db.transaction(async (tx) => {
      await publisher.publish(tx, event);
    });

    await relay.runOnce();
    const afterFailure = await outboxRow(event.id);

    await relay.runOnce();
    const afterRetry = await outboxRow(event.id);

    expect(afterFailure).toEqual({
      attempts: 1,
      last_error: 'reliability no disponible',
      delivered: false,
      failed: false,
    });
    expect(calls).toBe(2);
    expect(afterRetry.delivered).toBe(true);
  });

  async function outboxRow(id: string): Promise<OutboxRow> {
    const result = await db.execute<OutboxRow>(
      sql`select attempts, last_error, delivered_at is not null as delivered, failed_at is not null as failed
          from shared.outbox where id = ${id}`,
    );
    const row = result.rows[0];
    if (!row) throw new Error(`No existe el evento ${id} en shared.outbox`);
    return row;
  }
});

interface OutboxRow extends Record<string, unknown> {
  attempts: number;
  last_error: string | null;
  delivered: boolean;
  failed: boolean;
}
