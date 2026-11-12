// Interfaz pública del bus de eventos (ADR-015). Los módulos importan solo desde aquí.
export { createEvent, type DomainEvent } from './domain-event';
export { EventsModule } from './events.module';
export { EventBus, type EventHandler } from './infrastructure/event-bus';
export { OutboxPublisher } from './infrastructure/outbox-publisher';
export { OutboxRelay } from './infrastructure/outbox-relay';
