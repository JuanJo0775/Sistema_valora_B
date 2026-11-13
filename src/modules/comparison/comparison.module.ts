import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { EventBus } from '../../shared/events';
import { CatalogModule, ProductForComparison } from '../catalog';
import { EstablishmentsModule, EstablishmentsWithinRadius } from '../establishments';
import { CompareProduct } from './application/compare-product';
import { ComparisonController } from './http/comparison.controller';
import { DrizzleCurrentPrices } from './infrastructure/drizzle-current-prices';
import { onPriceReported } from './infrastructure/price-reported-handler';

@Module({
  imports: [CatalogModule, EstablishmentsModule],
  controllers: [ComparisonController],
  providers: [
    {
      provide: CompareProduct,
      inject: [DATABASE, ProductForComparison, EstablishmentsWithinRadius],
      useFactory: (
        db: Database,
        products: ProductForComparison,
        stores: EstablishmentsWithinRadius,
      ): CompareProduct =>
        new CompareProduct({
          products,
          stores,
          prices: new DrizzleCurrentPrices(db),
          clock: { now: () => new Date() },
        }),
    },
  ],
})
export class ComparisonModule implements OnModuleInit {
  constructor(private readonly bus: EventBus) {}

  // Grill de la #14, pregunta 1: price_current se actualiza al llegar PriceReported por el outbox.
  onModuleInit(): void {
    this.bus.subscribe('comparison.price_current', 'PriceReported', onPriceReported);
  }
}
