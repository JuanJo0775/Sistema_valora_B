// Interfaz pública del módulo catalog. Otros módulos y AppModule importan solo desde aquí.
export { CatalogModule } from './catalog.module';
export { ImportCatalog, type ProductImport } from './application/import-catalog';
export type {
  WholesaleReference,
  WholesaleReferenceView,
} from './application/wholesale-references';
export { PresentationExists } from './application/presentation-exists';
export { PresentationFreshness } from './application/presentation-freshness';
export { PresentationLabels } from './application/presentation-labels';
export { PresentationsForPricing } from './application/presentations-for-pricing';
export { ProductForComparison } from './application/product-for-comparison';
export { ProductSummaries } from './application/product-summaries';
export { WholesaleReferenceOf } from './application/wholesale-reference-of';
export type {
  PresentationForPricing,
  ProductForComparisonView,
  ProductSummaryView,
} from './application/product-repository';
