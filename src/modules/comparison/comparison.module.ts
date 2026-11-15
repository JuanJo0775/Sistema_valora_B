import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { EventBus } from '../../shared/events';
import {
  CatalogModule,
  PresentationLabels,
  PresentationsForPricing,
  ProductForComparison,
} from '../catalog';
import {
  EstablishmentDetails,
  EstablishmentsModule,
  EstablishmentsWithinRadius,
} from '../establishments';
import { ReliabilityModule, ReliabilityOfPrices } from '../reliability';
import { CompareProduct } from './application/compare-product';
import { PriceHistory } from './application/price-history';
import { StorePrices } from './application/store-prices';
import { ComparisonController } from './http/comparison.controller';
import { PriceHistoryController } from './http/price-history.controller';
import { StorePricesController } from './http/store-prices.controller';
import { DrizzleCurrentPrices } from './infrastructure/drizzle-current-prices';
import { DrizzlePriceHistory } from './infrastructure/drizzle-price-history';
import { onPriceAssessed } from './infrastructure/price-assessed-handler';
import {
  onPriceAssessedForHistory,
  onPriceWithdrawnForHistory,
} from './infrastructure/price-history-handlers';
import { onPriceWithdrawn } from './infrastructure/price-withdrawn-handler';

@Module({
  imports: [CatalogModule, EstablishmentsModule, ReliabilityModule],
  controllers: [ComparisonController, StorePricesController, PriceHistoryController],
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
    {
      provide: StorePrices,
      inject: [DATABASE, EstablishmentDetails, PresentationsForPricing, ReliabilityOfPrices],
      useFactory: (
        db: Database,
        stores: EstablishmentDetails,
        presentations: PresentationsForPricing,
        reliability: ReliabilityOfPrices,
      ): StorePrices =>
        new StorePrices({
          stores,
          presentations,
          prices: new DrizzleCurrentPrices(db),
          reliability,
          clock: { now: () => new Date() },
        }),
    },
    // Grill de la #83: historial de precios de un producto.
    {
      provide: PriceHistory,
      inject: [DATABASE, ProductForComparison, PresentationLabels],
      useFactory: (
        db: Database,
        products: ProductForComparison,
        labels: PresentationLabels,
      ): PriceHistory =>
        new PriceHistory({
          products,
          labels,
          history: new DrizzlePriceHistory(db),
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
    // Grill de la #83: el historial de precios, con los mismos eventos.
    this.bus.subscribe('comparison.price_history', 'PriceAssessed', onPriceAssessedForHistory);
    this.bus.subscribe('comparison.price_history', 'PriceWithdrawn', onPriceWithdrawnForHistory);
  }
}
