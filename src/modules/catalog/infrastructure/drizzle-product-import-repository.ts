import { asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ProductImport, ProductImportRepository } from '../application/import-catalog';
import { categories, presentations, products } from './schema';

export class DrizzleProductImportRepository implements ProductImportRepository {
  constructor(private readonly db: NodePgDatabase) {}

  // El producto y sus presentaciones se guardan juntos o no se guarda nada.
  async save(product: ProductImport): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = {
        id: product.id,
        name: product.name,
        brand: product.brand ?? null,
        categoryCode: product.categoryCode,
      };
      await tx
        .insert(products)
        .values(row)
        .onConflictDoUpdate({
          target: products.id,
          set: { name: row.name, brand: row.brand, categoryCode: row.categoryCode },
        });

      for (const presentation of product.presentations) {
        const values = {
          id: presentation.id,
          productId: product.id,
          barcode: presentation.barcode ?? null,
          quantity: String(presentation.quantity),
          unit: presentation.unit,
          packCount: presentation.packCount,
        };
        await tx
          .insert(presentations)
          .values(values)
          .onConflictDoUpdate({
            target: presentations.id,
            set: {
              barcode: values.barcode,
              quantity: values.quantity,
              unit: values.unit,
              packCount: values.packCount,
            },
          });
      }
    });
  }

  async listProductIds(): Promise<string[]> {
    const rows = await this.db.select({ id: products.id }).from(products).orderBy(asc(products.id));
    return rows.map((row) => row.id);
  }

  async listCategoryCodes(): Promise<string[]> {
    const rows = await this.db
      .select({ code: categories.code })
      .from(categories)
      .orderBy(asc(categories.code));
    return rows.map((row) => row.code);
  }
}
