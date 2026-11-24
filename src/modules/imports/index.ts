// Interfaz pública del módulo imports. La usan los comandos pnpm db:seed (src/seed.ts),
// pnpm quality:accuracy (src/accuracy.ts) y pnpm seed:imagenes (src/seed-images.ts).
export { ImportsModule } from './imports.module';
export { RunSeed } from './application/run-seed';
export { AccuracySample } from './application/accuracy-sample';
export { fetchSeedImages, imagesSummary } from './application/product-images';
export { OpenFoodFactsImages } from './infrastructure/open-food-facts';
export { ProductsCsvFile } from './infrastructure/products-csv-file';
export {
  type InitialPrice,
  type InitialPricesResult,
  SeedInitialPrices,
} from './application/initial-prices';

export { PreviewOlimpica } from './application/preview-olimpica';
export { OlimpicaVtex } from './infrastructure/olimpica-vtex';

export { applyOlimpica, type OnlineObservation } from './application/apply-olimpica';
export { OlimpicaObservations } from './infrastructure/olimpica-observations';

export { ONLINE_OFFERS_ENABLED } from './application/list-online-offers';
