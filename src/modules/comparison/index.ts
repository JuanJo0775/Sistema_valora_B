// Interfaz pública del módulo comparison. Otros módulos y AppModule importan solo desde aquí.
export {
  ComparisonModule,
  PRICE_HISTORY_CONSUMER,
  PRICE_HISTORY_EVENTS,
} from './comparison.module';
export { CurrentPriceOf } from './application/current-price-of';
export { ImportInitialPrices, type NewInitialPrice } from './application/import-initial-prices';
export { PeerPrices, type PeerPrice } from './application/peer-prices';
// B9 (#209): commerce avisa al comercio sus discrepancias; el núcleo no conoce commerce.
export { OfficialDiscrepancies } from './application/official-discrepancies';
