import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { GetProduct } from './application/get-product';
import { PRODUCT_REPOSITORY, type ProductRepository } from './application/product-repository';
import { ProductsController } from './http/products.controller';
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
  ],
})
export class CatalogModule {}
