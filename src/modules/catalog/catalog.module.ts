import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.validation';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { IdentityModule } from '../identity';
import { DecideProductRequest } from './application/decide-product-request';
import { GetProduct } from './application/get-product';
import { ListCategories } from './application/list-categories';
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
import { ProductSummaries } from './application/product-summaries';
import { PRODUCT_REPOSITORY, type ProductRepository } from './application/product-repository';
import {
  PRODUCT_REQUEST_REPOSITORY,
  type ProductRequestRepository,
} from './application/product-requests';
import { ProductRequestsQueue } from './application/product-requests-queue';
import { RequestProduct } from './application/request-product';
import { SearchProducts } from './application/search-products';
import { WholesaleReferenceOf } from './application/wholesale-reference-of';
import type { ImageStorage } from './application/product-image';
import { MirrorProductImages } from './application/mirror-product-images';
import { SetProductImage } from './application/set-product-image';
import { CategoriesController } from './http/categories.controller';
import { ProductImageController } from './http/product-image.controller';
import { ProductRequestsController } from './http/product-requests.controller';
import { ProductsController } from './http/products.controller';
import { DrizzleProductImportRepository } from './infrastructure/drizzle-product-import-repository';
import { DrizzleProductRepository } from './infrastructure/drizzle-product-repository';
import { DrizzleProductRequestRepository } from './infrastructure/drizzle-product-request-repository';
import { DrizzleWholesaleReferenceRepository } from './infrastructure/drizzle-wholesale-reference-repository';
import { HttpImageDownloader } from './infrastructure/http-image-downloader';
import { LocalImageStorage } from './infrastructure/local-image-storage';
import { SupabaseImageStorage } from './infrastructure/supabase-image-storage';
import { SharpImageProcessor } from './infrastructure/sharp-image-processor';

@Module({
  imports: [IdentityModule],
  controllers: [
    ProductsController,
    CategoriesController,
    ProductRequestsController,
    ProductImageController,
  ],
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
          // ADR-022: con SUPABASE_URL las fotos van a Supabase Storage; sin ella, a la carpeta local.
          storage: imageStorage(config),
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
      provide: ListCategories,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): ListCategories => new ListCategories(products),
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
    // ADR-022 (actualización): pnpm seed:espejo-fotos copia las fotos externas al bucket. Sin Supabase
    // configurado no se arma: el comando lo avisa antes de llegar aquí.
    {
      provide: MirrorProductImages,
      inject: [PRODUCT_IMPORT_REPOSITORY, ConfigService],
      useFactory: (
        images: ProductImportRepository,
        config: ConfigService<Env, true>,
      ): MirrorProductImages => {
        const supabaseUrl = config.get('SUPABASE_URL', { infer: true });
        if (supabaseUrl === undefined) throw new Error('Falta SUPABASE_URL.');
        return new MirrorProductImages({
          images,
          downloader: new HttpImageDownloader(),
          processor: new SharpImageProcessor(),
          storage: imageStorage(config),
          supabaseUrl,
        });
      },
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
    // Grill de la #34: la referencia SIPSA para la comparación.
    {
      provide: WholesaleReferenceOf,
      inject: [DATABASE],
      useFactory: (db: Database): WholesaleReferenceOf =>
        new WholesaleReferenceOf(new DrizzleWholesaleReferenceRepository(db)),
    },
    {
      provide: PresentationLabels,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): PresentationLabels =>
        new PresentationLabels(products),
    },
    // B#120: nombre y categoría de los productos de la canasta básica.
    {
      provide: ProductSummaries,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository): ProductSummaries => new ProductSummaries(products),
    },
  ],
  exports: [
    ImportCatalog,
    MirrorProductImages,
    WholesaleReferenceOf,
    PresentationExists,
    ProductForComparison,
    PresentationFreshness,
    PresentationLabels,
    PresentationsForPricing,
    ProductSummaries,
  ],
})
export class CatalogModule {}

// Elige dónde se guardan las fotos subidas según el entorno (ADR-022).
function imageStorage(config: ConfigService<Env, true>): ImageStorage {
  const supabaseUrl = config.get('SUPABASE_URL', { infer: true });
  const secretKey = config.get('SUPABASE_SECRET_KEY', { infer: true });
  if (supabaseUrl !== undefined && secretKey !== undefined) {
    return new SupabaseImageStorage({
      url: supabaseUrl,
      secretKey,
      bucket: config.get('SUPABASE_BUCKET', { infer: true }),
    });
  }
  return new LocalImageStorage(
    config.get('MEDIA_DIR', { infer: true }),
    config.get('MEDIA_PUBLIC_URL', { infer: true }),
  );
}
