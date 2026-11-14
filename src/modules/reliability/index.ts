// Interfaz pública del módulo reliability. Otros módulos y AppModule importan solo desde aquí.
export { ReliabilityModule } from './reliability.module';
export {
  type PriceRef,
  type PriceReliability,
  ReliabilityOfPrices,
} from './application/reliability-of-prices';
export { PRICE_ASSESSED } from './application/assess-reported-price';
