import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.validation';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { IdentityModule } from '../identity';
import { DecideProductRequest } from './application/decide-product-request';
import { GetProduct } from './application/get-product';
import {
  ImportCatalog,
  PRODUCT_IMPORT_REPOSITORY,
  type ProductImportRepository,
} from './application/import-catalog';
import { PresentationExists } from './application/presentation-exists';
import { PresentationFreshness } from './application/presentation-freshness';
import { PresentationLabels } from './application/presentation-labels';
import { PresentationsForPricing } from './application/presentations-for-pricing';
import { ProductForComparison } from './application/product-for-comparison';
import { PRODUCT_REPOSITORY, type ProductRepository } from './application/product-repository';
import {
  PRODUCT_REQUEST_REPOSITORY,
  type ProductRequestRepository,
} from './application/product-requests';
import { ProductRequestsQueue } from './application/product-requests-queue';
import { RequestProduct } from './application/request-product';
import { SearchProducts } from './application/search-products';
import { SetProductImage } from './application/set-product-image';
import { ProductImageController } from './http/product-image.controller';
import { ProductRequestsController } from './http/product-requests.controller';
import { ProductsController } from './http/products.controller';
import { DrizzleProductImportRepository } from './infrastructure/drizzle-product-import-repository';
import { DrizzleProductRepository } from './infrastructure/drizzle-product-repository';
import { DrizzleProductRequestRepository } from './infrastructure/drizzle-product-request-repository';
import { DrizzleWholesaleReferenceRepository } from './infrastructure/drizzle-wholesale-reference-repository';
import { LocalImageStorage } from './infrastructure/local-image-storage';
import { SharpImageProcessor } from './infrastructure/sharp-image-processor';

@Module({
  imports: [IdentityModule],
  controllers: [ProductsController, ProductRequestsController, ProductImageController],
  providers: [
    // ADR-020 (#88): el moderador sube la foto de un producto.
    {
      provide: SetProductImage,
      inject: [DATABASE, PRODUCT_REPOSITORY, ConfigService],
      useFactory: (
        db: Database,
        products: ProductRepository,
        config: ConfigService<Env, true>,
      ): SetProductImage =>
        new SetProductImage({
          products: {
            exists: async (productId) => (await products.findById(productId)) !== null,
          },
          processor: new SharpImageProcessor(),
          storage: new LocalImageStorage(
            config.get('MEDIA_DIR', { infer: true }),
            config.get('MEDIA_PUBLIC_URL', { infer: true }),
          ),
          images: new DrizzleProductImportRepository(db),
        }),
    },
    {
      provide: PRODUCT_REQUEST_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): ProductRequestRepository =>
        new DrizzleProductRequestRepository(db),
    },
    // Grill de la #26, pregunta 3: un reportante propone un producto.
    {
      provide: RequestProduct,
      inject: [PRODUCT_REQUEST_REPOSITORY, PRODUCT_REPOSITORY, PRODUCT_IMPORT_REPOSITORY],
      useFactory: (
        requests: ProductRequestRepository,
        products: ProductRepository,
        categories: ProductImportRepository,
      ): RequestProduct =>
        new RequestProduct({ requests, products, categories, clock: { now: () => new Date() } }),
    },
    {
      provide: ProductRequestsQueue,
      inject: [PRODUCT_REQUEST_REPOSITORY, PRODUCT_REPOSITORY],
      useFactory: (
        requests: ProductRequestRepository,
        products: ProductRepository,
      ): ProductRequestsQueue => new ProductRequestsQueue({ requests, products }),
    },
    {
      provide: DecideProductRequest,
      inject: [PRODUCT_REQUEST_REPOSITORY, PRODUCT_REPOSITORY],
      useFactory: (
        requests: ProductRequestRepository,
        products: ProductRepository,
      ): DecideProductRequest =>
        new DecideProductRequest({ requests, products, clock: { now: () => new Date() } }),
    },
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
      inject: [PRODUCT_IMPORT_REPOSITORY, DATABASE],
      useFactory: (repository: ProductImportRepository, db: Database): ImportCatalog =>
        new ImportCatalog(repository, new DrizzleWholesaleReferenceRepository(db)),
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
      provide: PresentationsForPricing,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): PresentationsForPricing =>
        new PresentationsForPricing(products),
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
    PresentationsForPricing,
  ],
})
export class CatalogModule {}
