import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { GetProduct } from './application/get-product';
import {
  ImportCatalog,
  PRODUCT_IMPORT_REPOSITORY,
  type ProductImportRepository,
} from './application/import-catalog';
import { PresentationExists } from './application/presentation-exists';
import { PresentationFreshness } from './application/presentation-freshness';
import { PresentationLabels } from './application/presentation-labels';
import { ProductForComparison } from './application/product-for-comparison';
import { PRODUCT_REPOSITORY, type ProductRepository } from './application/product-repository';
import { SearchProducts } from './application/search-products';
import { ProductsController } from './http/products.controller';
import { DrizzleProductImportRepository } from './infrastructure/drizzle-product-import-repository';
import { DrizzleProductRepository } from './infrastructure/drizzle-product-repository';

@Module({
  controllers: [ProductsController],
  providers: [
    {
      provide: PRODUCT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): ProductRepository => new DrizzleProductRepository(db),
    },
    {
      provide: GetProduct,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): GetProduct => new GetProduct(products),
    },
    {
      provide: SearchProducts,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): SearchProducts => new SearchProducts(products),
    },
    {
      provide: PRODUCT_IMPORT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): ProductImportRepository => new DrizzleProductImportRepository(db),
    },
    {
      provide: ImportCatalog,
      inject: [PRODUCT_IMPORT_REPOSITORY],
      useFactory: (repository: ProductImportRepository): ImportCatalog =>
        new ImportCatalog(repository),
    },
    {
      provide: PresentationExists,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): PresentationExists =>
        new PresentationExists(products),
    },
    {
      provide: ProductForComparison,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): ProductForComparison =>
        new ProductForComparison(products),
    },
    {
      provide: PresentationFreshness,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): PresentationFreshness =>
        new PresentationFreshness(products),
    },
    {
      provide: PresentationLabels,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): PresentationLabels =>
        new PresentationLabels(products),
    },
  ],
  exports: [
    ImportCatalog,
    PresentationExists,
    ProductForComparison,
    PresentationFreshness,
    PresentationLabels,
  ],
})
export class CatalogModule {}
