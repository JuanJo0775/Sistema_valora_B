import { Module, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../shared/events';
import { onPriceReported } from './infrastructure/price-reported-handler';

@Module({})
export class ComparisonModule implements OnModuleInit {
  constructor(private readonly bus: EventBus) {}

  // Grill de la #14, pregunta 1: price_current se actualiza al llegar PriceReported por el outbox.
  onModuleInit(): void {
    this.bus.subscribe('comparison.price_current', 'PriceReported', onPriceReported);
  }
}
