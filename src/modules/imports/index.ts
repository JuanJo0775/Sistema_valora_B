// Interfaz pública del módulo imports. La usan los comandos pnpm db:seed (src/seed.ts),
// pnpm quality:accuracy (src/accuracy.ts) y pnpm seed:imagenes (src/seed-images.ts).
export { ImportsModule } from './imports.module';
export { RunSeed } from './application/run-seed';
export { AccuracySample } from './application/accuracy-sample';
export { fetchSeedImages, imagesSummary } from './application/product-images';
export { OpenFoodFactsImages } from './infrastructure/open-food-facts';
export { ProductsCsvFile } from './infrastructure/products-csv-file';
