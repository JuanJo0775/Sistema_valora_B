import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Env } from '../../config/env.validation';
import { DATABASE, type Database } from '../../database/database.module';
import { EventBus } from './event-bus';
import { outbox } from './schema';

type OutboxRow = typeof outbox.$inferSelect;

// Repartidor: entrega los eventos pendientes de la bandeja de salida (ADR-015).
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly maxAttempts: number;
  private readonly pollIntervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly bus: EventBus,
    config: ConfigService<Env, true>,
  ) {
    this.maxAttempts = config.get('OUTBOX_MAX_ATTEMPTS', { infer: true });
    this.pollIntervalMs = config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true });
  }

  // Grill de la #43, pregunta 2: revisa la bandeja cada OUTBOX_POLL_INTERVAL_MS, sin solapar revisiones.
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.runOnce()
        .catch((error: unknown) => {
          this.logger.error(error instanceof Error ? error.stack : String(error));
        })
        .finally(() => {
          this.running = undefined;
        });
    }, this.pollIntervalMs);
  }

  // Se detiene antes de que se cierre la conexión a la base.
  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  async runOnce(): Promise<void> {
    const pending = await this.db
      .select()
      .from(outbox)
      .where(and(isNull(outbox.deliveredAt), isNull(outbox.failedAt)))
      .orderBy(asc(outbox.occurredAt));

    for (const row of pending) {
      try {
        await this.bus.deliver({
          id: row.id,
          type: row.type,
          version: row.version,
          occurredAt: row.occurredAt,
          payload: row.payload,
        });
        await this.db.update(outbox).set({ deliveredAt: new Date() }).where(eq(outbox.id, row.id));
      } catch (error) {
        await this.recordFailure(row, error);
      }
    }
  }

  // Grill de la #83, pregunta 6: vuelve a entregar a un solo receptor los eventos ya entregados de
  // esos tipos, en orden. Los que ese receptor ya procesó se saltan (processed_events), así que se
  // puede repetir. Devuelve cuántos eventos revisó.
  async redeliver(types: string[], consumer: string): Promise<number> {
    const delivered = await this.db
      .select()
      .from(outbox)
      .where(and(inArray(outbox.type, types), isNotNull(outbox.deliveredAt)))
      .orderBy(asc(outbox.occurredAt));
    for (const row of delivered) {
      await this.bus.deliver(
        {
          id: row.id,
          type: row.type,
          version: row.version,
          occurredAt: row.occurredAt,
          payload: row.payload,
        },
        consumer,
      );
    }
    return delivered.length;
  }

  // Grill de la #43, pregunta 3: un intento más y su error; al llegar al máximo queda fallido.
  private async recordFailure(row: OutboxRow, error: unknown): Promise<void> {
    const attempts = row.attempts + 1;
    const lastError = error instanceof Error ? error.message : String(error);
    const exhausted = attempts >= this.maxAttempts;
    await this.db
      .update(outbox)
      .set({ attempts, lastError, failedAt: exhausted ? new Date() : null })
      .where(eq(outbox.id, row.id));
    if (exhausted) {
      this.logger.error(
        `El evento ${row.type} (${row.id}) quedó fallido tras ${String(attempts)} intentos: ${lastError}`,
      );
    }
  }
}
