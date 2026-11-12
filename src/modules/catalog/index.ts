// Interfaz pública del módulo catalog. Otros módulos y AppModule importan solo desde aquí.
export { CatalogModule } from './catalog.module';
export { ImportCatalog, type ProductImport } from './application/import-catalog';
export { PresentationExists } from './application/presentation-exists';
