import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../database/database.module';
import type { DomainEvent } from '../domain-event';

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

  async deliver(event: DomainEvent): Promise<void> {
    for (const { handler } of this.subscriptions.get(event.type) ?? []) {
      await this.db.transaction((tx) => handler(event, tx));
    }
  }
}
