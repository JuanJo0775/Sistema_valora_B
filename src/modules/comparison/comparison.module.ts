import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { EventBus } from '../../shared/events';
import {
  CatalogModule,
  PresentationLabels,
  PresentationsForPricing,
  ProductForComparison,
  ProductSummaries,
  WholesaleReferenceOf,
} from '../catalog';
import {
  EstablishmentDetails,
  EstablishmentsModule,
  EstablishmentsWithinRadius,
} from '../establishments';
import { ReliabilityModule, ReliabilityOfPrices } from '../reliability';
import { CompareProduct } from './application/compare-product';
import { CurrentPriceOf } from './application/current-price-of';
import { FeaturedProducts } from './application/featured-products';
import { PriceHistory } from './application/price-history';
import { StorePrices } from './application/store-prices';
import { ComparisonController } from './http/comparison.controller';
import { FeaturedProductsController } from './http/featured-products.controller';
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

// Grill de la #83, pregunta 6: el receptor del historial y los eventos que lo llenan, para reconstruirlo.
export const PRICE_HISTORY_CONSUMER = 'comparison.price_history';
export const PRICE_HISTORY_EVENTS = ['PriceAssessed', 'PriceWithdrawn'];

@Module({
  imports: [CatalogModule, EstablishmentsModule, ReliabilityModule],
  controllers: [
    ComparisonController,
    StorePricesController,
    PriceHistoryController,
    FeaturedProductsController,
  ],
  providers: [
    {
      provide: CompareProduct,
      inject: [
        DATABASE,
        ProductForComparison,
        EstablishmentsWithinRadius,
        ReliabilityOfPrices,
        WholesaleReferenceOf,
      ],
      useFactory: (
        db: Database,
        products: ProductForComparison,
        stores: EstablishmentsWithinRadius,
        reliability: ReliabilityOfPrices,
        references: WholesaleReferenceOf,
      ): CompareProduct =>
        new CompareProduct({
          products,
          stores,
          prices: new DrizzleCurrentPrices(db),
          reliability,
          references,
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
    // B#120: la canasta básica de hoy en un municipio.
    {
      provide: FeaturedProducts,
      inject: [DATABASE, EstablishmentsWithinRadius, PresentationsForPricing, ProductSummaries],
      useFactory: (
        db: Database,
        stores: EstablishmentsWithinRadius,
        presentations: PresentationsForPricing,
        products: ProductSummaries,
      ): FeaturedProducts =>
        new FeaturedProducts({
          prices: new DrizzleCurrentPrices(db),
          stores,
          presentations,
          products,
          clock: { now: () => new Date() },
        }),
    },
    // PR-22 (#93): el precio publicado, para el informe de exactitud.
    {
      provide: CurrentPriceOf,
      inject: [DATABASE],
      useFactory: (db: Database): CurrentPriceOf =>
        new CurrentPriceOf(new DrizzleCurrentPrices(db)),
    },
  ],
  exports: [CurrentPriceOf],
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
    this.bus.subscribe(PRICE_HISTORY_CONSUMER, 'PriceAssessed', onPriceAssessedForHistory);
    this.bus.subscribe(PRICE_HISTORY_CONSUMER, 'PriceWithdrawn', onPriceWithdrawnForHistory);
  }
}
