import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../database/database.module';
import type { DomainEvent } from '../domain-event';
import { outbox } from './schema';

// Guarda el evento en la bandeja de salida usando la transacción del cambio que lo causa (ADR-015).
@Injectable()
export class OutboxPublisher {
  async publish(tx: Transaction, event: DomainEvent): Promise<void> {
    await tx.insert(outbox).values({
      id: event.id,
      type: event.type,
      version: event.version,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });
  }
}
