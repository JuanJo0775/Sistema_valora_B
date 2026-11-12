import { Global, Module } from '@nestjs/common';
import { EventBus } from './infrastructure/event-bus';
import { OutboxPublisher } from './infrastructure/outbox-publisher';
import { OutboxRelay } from './infrastructure/outbox-relay';

@Global()
@Module({
  providers: [EventBus, OutboxPublisher, OutboxRelay],
  exports: [EventBus, OutboxPublisher, OutboxRelay],
})
export class EventsModule {}
