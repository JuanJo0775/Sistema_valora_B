// Interfaz pública del módulo catalog. Otros módulos y AppModule importan solo desde aquí.
export { CatalogModule } from './catalog.module';
export { ImportCatalog, type ProductImport } from './application/import-catalog';
export type {
  WholesaleReference,
  WholesaleReferenceView,
} from './application/wholesale-references';
export { MirrorProductImages, mirrorSummary } from './application/mirror-product-images';
export { PresentationExists } from './application/presentation-exists';
export { PresentationsByBarcode } from './application/presentations-by-barcode';
export { PresentationFreshness } from './application/presentation-freshness';
export { PresentationLabels } from './application/presentation-labels';
export { PresentationNames } from './application/presentation-names';
export { PresentationsForPricing } from './application/presentations-for-pricing';
export { ProductRequestsQueue } from './application/product-requests-queue';
export { ProductForComparison } from './application/product-for-comparison';
export { ProductSummaries } from './application/product-summaries';
export { WholesaleReferenceOf } from './application/wholesale-reference-of';
export type {
  PresentationForPricing,
  PresentationName,
  ProductForComparisonView,
  ProductSummaryView,
} from './application/product-repository';
export { readPresentationsByBarcode } from './read-presentations-by-barcode';
