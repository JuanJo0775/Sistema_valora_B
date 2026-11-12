import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, isNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { EventBus } from './event-bus';
import { outbox } from './schema';

// Repartidor: entrega los eventos pendientes de la bandeja de salida (ADR-015).
@Injectable()
export class OutboxRelay {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly bus: EventBus,
  ) {}

  async runOnce(): Promise<void> {
    const pending = await this.db
      .select()
      .from(outbox)
      .where(isNull(outbox.deliveredAt))
      .orderBy(asc(outbox.occurredAt));

    for (const row of pending) {
      await this.bus.deliver({
        id: row.id,
        type: row.type,
        version: row.version,
        occurredAt: row.occurredAt,
        payload: row.payload,
      });
      await this.db.update(outbox).set({ deliveredAt: new Date() }).where(eq(outbox.id, row.id));
    }
  }
}
