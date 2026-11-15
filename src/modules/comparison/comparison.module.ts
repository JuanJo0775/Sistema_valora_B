import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { EventBus } from '../../shared/events';
import { CatalogModule, ProductForComparison } from '../catalog';
import { EstablishmentsModule, EstablishmentsWithinRadius } from '../establishments';
import { ReliabilityModule, ReliabilityOfPrices } from '../reliability';
import { CompareProduct } from './application/compare-product';
import { ComparisonController } from './http/comparison.controller';
import { DrizzleCurrentPrices } from './infrastructure/drizzle-current-prices';
import { onPriceAssessed } from './infrastructure/price-assessed-handler';
import { onPriceWithdrawn } from './infrastructure/price-withdrawn-handler';

@Module({
  imports: [CatalogModule, EstablishmentsModule, ReliabilityModule],
  controllers: [ComparisonController],
  providers: [
    {
      provide: CompareProduct,
      inject: [DATABASE, ProductForComparison, EstablishmentsWithinRadius, ReliabilityOfPrices],
      useFactory: (
        db: Database,
        products: ProductForComparison,
        stores: EstablishmentsWithinRadius,
        reliability: ReliabilityOfPrices,
      ): CompareProduct =>
        new CompareProduct({
          products,
          stores,
          prices: new DrizzleCurrentPrices(db),
          reliability,
          clock: { now: () => new Date() },
        }),
    },
  ],
})
export class ComparisonModule implements OnModuleInit {
  constructor(private readonly bus: EventBus) {}

  // Grill de la #31, pregunta 4: price_current se actualiza con el veredicto de reliability
  // (PriceAssessed), ya no directamente con PriceReported. Grill de la #32: y deja de mostrar un
  // precio que el moderador descartó (PriceWithdrawn).
  onModuleInit(): void {
    this.bus.subscribe('comparison.price_current', 'PriceAssessed', onPriceAssessed);
    this.bus.subscribe('comparison.price_current', 'PriceWithdrawn', onPriceWithdrawn);
  }
}
