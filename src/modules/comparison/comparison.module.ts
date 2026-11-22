import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { EventBus } from '../../shared/events';
import {
  CatalogModule,
  PresentationFreshness,
  PresentationLabels,
  PresentationsForPricing,
  ProductForComparison,
  ProductSummaries,
  WholesaleReferenceOf,
} from '../catalog';
import {
  EstablishmentDetails,
  StoreContactOf,
  EstablishmentsModule,
  EstablishmentsWithinRadius,
} from '../establishments';
import { PeerPrices } from './application/peer-prices';
import { DrizzlePeerPrices } from './infrastructure/drizzle-peer-prices';
import { PriceCounts } from './application/price-counts';
import { EstablishmentListsController } from './http/establishment-lists.controller';
import { ReliabilityModule, ReliabilityOfPrices } from '../reliability';
import { CompareProduct } from './application/compare-product';
import { CurrentPriceOf } from './application/current-price-of';
import { ImportInitialPrices } from './application/import-initial-prices';
import { DrizzleInitialPrices } from './infrastructure/drizzle-initial-prices';
import { FeaturedProducts } from './application/featured-products';
import { PriceHistory } from './application/price-history';
import { StorePrices } from './application/store-prices';
import { ComparisonController } from './http/comparison.controller';
import { FeaturedProductsController } from './http/featured-products.controller';
import { PriceHistoryController } from './http/price-history.controller';
import { StorePricesController } from './http/store-prices.controller';
import { DrizzleCurrentPrices } from './infrastructure/drizzle-current-prices';
import { OfficialDiscrepancies } from './application/official-discrepancies';
import { DrizzleOfficialPriceCopies } from './infrastructure/drizzle-official-price-copies';
import { DrizzlePromotionCopies } from './infrastructure/drizzle-promotion-copies';
import { DrizzlePriceHistory } from './infrastructure/drizzle-price-history';
import { onPriceAssessed } from './infrastructure/price-assessed-handler';
import {
  onOfficialPricePublished,
  onOfficialPricesReconfirmed,
  onOfficialPriceWithdrawn,
} from './infrastructure/official-price-handlers';
import { onPromotionPublished, onPromotionWithdrawn } from './infrastructure/promotion-handlers';
import {
  onPriceAssessedForHistory,
  onPriceWithdrawnForHistory,
} from './infrastructure/price-history-handlers';
import { onPriceFlagged, onPriceFlaggedForHistory } from './infrastructure/price-flagged-handler';
import { onPriceWithdrawn } from './infrastructure/price-withdrawn-handler';

// Grill de la #83, pregunta 6: el receptor del historial y los eventos que lo llenan, para reconstruirlo.
export const PRICE_HISTORY_CONSUMER = 'comparison.price_history';
export const PRICE_HISTORY_EVENTS = ['PriceAssessed', 'PriceWithdrawn', 'PriceFlagged'];

// Receptor de los eventos del precio oficial (#204).
const OFFICIAL_PRICES_CONSUMER = 'comparison.official_prices';
// Receptor de los eventos de las promociones (#206).
const PROMOTIONS_CONSUMER = 'comparison.promotions';

@Module({
  imports: [CatalogModule, EstablishmentsModule, ReliabilityModule],
  controllers: [
    // B#131: antes que StorePricesController, para que /establishments/nearby no se lea como un id.
    EstablishmentListsController,
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
          officials: new DrizzleOfficialPriceCopies(db),
          promotionCopies: new DrizzlePromotionCopies(db),
          reliability,
          references,
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: StorePrices,
      inject: [
        DATABASE,
        EstablishmentDetails,
        StoreContactOf,
        PresentationsForPricing,
        ReliabilityOfPrices,
      ],
      useFactory: (
        db: Database,
        stores: EstablishmentDetails,
        contacts: StoreContactOf,
        presentations: PresentationsForPricing,
        reliability: ReliabilityOfPrices,
      ): StorePrices =>
        new StorePrices({
          stores,
          contacts,
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
    // B#131: cuántos precios vigentes tiene cada tienda de una lista.
    {
      provide: PriceCounts,
      inject: [DATABASE, PresentationsForPricing, ReliabilityOfPrices],
      useFactory: (
        db: Database,
        presentations: PresentationsForPricing,
        reliability: ReliabilityOfPrices,
      ): PriceCounts =>
        new PriceCounts({
          prices: new DrizzleCurrentPrices(db),
          officials: new DrizzleOfficialPriceCopies(db),
          reliability,
          presentations,
          clock: { now: () => new Date() },
        }),
    },
    // B#135: los datos iniciales de la semilla (pnpm db:seed).
    {
      provide: ImportInitialPrices,
      inject: [DATABASE],
      useFactory: (db: Database): ImportInitialPrices =>
        new ImportInitialPrices(new DrizzleInitialPrices(db)),
    },
    // ADR-030: los precios vigentes de otras tiendas, como referencia de plausibilidad.
    {
      provide: PeerPrices,
      inject: [DATABASE],
      useFactory: (db: Database): PeerPrices => new PeerPrices(new DrizzlePeerPrices(db)),
    },
    // B9 (#209): las discrepancias corroboradas de una tienda, para avisar al comercio.
    {
      provide: OfficialDiscrepancies,
      inject: [DATABASE, ReliabilityOfPrices, PresentationFreshness],
      useFactory: (
        db: Database,
        reliability: ReliabilityOfPrices,
        presentations: PresentationFreshness,
      ): OfficialDiscrepancies =>
        new OfficialDiscrepancies({
          officials: new DrizzleOfficialPriceCopies(db),
          reliability,
          presentations,
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
  exports: [CurrentPriceOf, ImportInitialPrices, PeerPrices, OfficialDiscrepancies],
})
export class ComparisonModule implements OnModuleInit {
  constructor(private readonly bus: EventBus) {}

  // Grill de la #31, pregunta 4: price_current se actualiza con el veredicto de reliability
  // (PriceAssessed), ya no directamente con PriceReported. Grill de la #32: y deja de mostrar un
  // precio que el moderador descartó (PriceWithdrawn).
  onModuleInit(): void {
    this.bus.subscribe('comparison.price_current', 'PriceAssessed', onPriceAssessed);
    this.bus.subscribe('comparison.price_current', 'PriceWithdrawn', onPriceWithdrawn);
    // EC-03: un reporte marcado por una cuenta deja de ser el precio vigente mientras se revisa.
    this.bus.subscribe('comparison.price_current', 'PriceFlagged', onPriceFlagged);
    this.bus.subscribe(PRICE_HISTORY_CONSUMER, 'PriceFlagged', onPriceFlaggedForHistory);
    // Grill de la #83: el historial de precios, con los mismos eventos.
    this.bus.subscribe(PRICE_HISTORY_CONSUMER, 'PriceAssessed', onPriceAssessedForHistory);
    this.bus.subscribe(PRICE_HISTORY_CONSUMER, 'PriceWithdrawn', onPriceWithdrawnForHistory);
    // D1 y D4 del grill comercial (#204): la copia del precio oficial. Solo se conoce el nombre de los
    // eventos de commerce: el núcleo no importa commerce (EC-05).
    this.bus.subscribe(
      OFFICIAL_PRICES_CONSUMER,
      'OfficialPricePublished',
      onOfficialPricePublished,
    );
    this.bus.subscribe(
      OFFICIAL_PRICES_CONSUMER,
      'OfficialPricesReconfirmed',
      onOfficialPricesReconfirmed,
    );
    this.bus.subscribe(
      OFFICIAL_PRICES_CONSUMER,
      'OfficialPriceWithdrawn',
      onOfficialPriceWithdrawn,
    );
    // D6 (#206): la copia de las promociones, siempre aparte de los resultados (ADR-009).
    this.bus.subscribe(PROMOTIONS_CONSUMER, 'PromotionPublished', onPromotionPublished);
    this.bus.subscribe(PROMOTIONS_CONSUMER, 'PromotionWithdrawn', onPromotionWithdrawn);
  }
}
