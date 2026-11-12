import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Database } from '../../src/shared/database/database.module';
import type * as Events from '../../src/shared/events';

describe('repartidor automático', () => {
  let app: INestApplication;

  beforeAll(() => {
    // Intervalo corto solo para esta prueba (en la app real es OUTBOX_POLL_INTERVAL_MS=5000).
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '50';
  });

  afterAll(async () => {
    await app.close();
  });

  it('con la app encendida, entrega los eventos pendientes sin que nadie lo llame', async () => {
    const { AppModule } = await import('../../src/app.module');
    const { DATABASE } = await import('../../src/shared/database/database.module');
    const events: typeof Events = await import('../../src/shared/events');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    const event = events.createEvent('PrecioDePruebaAutomatico', 1, {});
    const delivered = new Promise<string>((resolve) => {
      app.get(events.EventBus).subscribe('receptor-automatico', event.type, (received) => {
        resolve(received.id);
        return Promise.resolve();
      });
    });
    await app.get<Database>(DATABASE).transaction(async (tx) => {
      await app.get(events.OutboxPublisher).publish(tx, event);
    });

    await expect(delivered).resolves.toBe(event.id);
  }, 5000);
});
