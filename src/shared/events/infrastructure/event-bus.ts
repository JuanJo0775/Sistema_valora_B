import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../database/database.module';
import type { DomainEvent } from '../domain-event';
import { processedEvents } from './schema';

export type EventHandler = (event: DomainEvent, tx: Transaction) => Promise<void>;

interface Subscription {
  consumer: string;
  handler: EventHandler;
}

// Bus interno mínimo (grill de la #43, pregunta 1): suscriptores por tipo de evento.
@Injectable()
export class EventBus {
  private readonly subscriptions = new Map<string, Subscription[]>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  subscribe(consumer: string, type: string, handler: EventHandler): void {
    const current = this.subscriptions.get(type) ?? [];
    this.subscriptions.set(type, [...current, { consumer, handler }]);
  }

  // Grill de la #43, pregunta 4: el registro en processed_events y el trabajo del suscriptor van en
  // la misma transacción; si el par (receptor, evento) ya existe, el suscriptor no se vuelve a llamar.
  async deliver(event: DomainEvent, onlyConsumer?: string): Promise<void> {
    for (const { consumer, handler } of this.subscriptions.get(event.type) ?? []) {
      // Grill de la #83, pregunta 6: al reconstruir, solo el receptor que se está llenando.
      if (onlyConsumer !== undefined && consumer !== onlyConsumer) continue;
      await this.db.transaction(async (tx) => {
        const registered = await tx
          .insert(processedEvents)
          .values({ consumer, eventId: event.id })
          .onConflictDoNothing()
          .returning({ eventId: processedEvents.eventId });
        if (registered.length === 0) return;
        await handler(event, tx);
      });
    }
  }
}
