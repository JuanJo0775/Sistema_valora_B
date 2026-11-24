import type { Database } from '../../shared/database/database.module';
import { PresentationsByBarcode } from './application/presentations-by-barcode';
import { DrizzleProductRepository } from './infrastructure/drizzle-product-repository';

export function readPresentationsByBarcode(db: Database): PresentationsByBarcode {
  return new PresentationsByBarcode(new DrizzleProductRepository(db));
}
