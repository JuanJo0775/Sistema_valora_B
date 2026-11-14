import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { EventBus } from '../../shared/events';
import { CatalogModule, ProductForComparison } from '../catalog';
import { EstablishmentsModule, EstablishmentsWithinRadius } from '../establishments';
import { CompareProduct } from './application/compare-product';
import { ComparisonController } from './http/comparison.controller';
import { DrizzleCurrentPrices } from './infrastructure/drizzle-current-prices';
import { onPriceAssessed } from './infrastructure/price-assessed-handler';

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

  // Grill de la #31, pregunta 4: price_current se actualiza con el veredicto de reliability
  // (PriceAssessed), ya no directamente con PriceReported.
  onModuleInit(): void {
    this.bus.subscribe('comparison.price_current', 'PriceAssessed', onPriceAssessed);
  }
}
