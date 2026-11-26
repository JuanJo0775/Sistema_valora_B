// Interfaz pública del módulo reliability. Otros módulos y AppModule importan solo desde aquí.
export { ReliabilityModule } from './reliability.module';
export {
  type PriceRef,
  type PriceReliability,
  ReliabilityOfPrices,
  type ReportAtStore,
} from './application/reliability-of-prices';
export { ModerationQueue } from './application/moderation-queue';
export { PRICE_ASSESSED } from './application/assess-reported-price';
