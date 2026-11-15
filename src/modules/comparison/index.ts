// Interfaz pública del módulo comparison. Otros módulos y AppModule importan solo desde aquí.
export {
  ComparisonModule,
  PRICE_HISTORY_CONSUMER,
  PRICE_HISTORY_EVENTS,
} from './comparison.module';
export { CurrentPriceOf } from './application/current-price-of';
