import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ProductImport, ProductImportRepository } from '../application/import-catalog';
import type { ProductImage } from '../application/product-repository';
import { categories, presentations, productAliases, products } from './schema';

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
        imageUrl: product.image?.url ?? null,
        imageSource: product.image?.source ?? null,
        imageAttribution: product.image?.attribution ?? null,
      };
      await tx
        .insert(products)
        .values(row)
        .onConflictDoUpdate({
          target: products.id,
          set: {
            name: row.name,
            brand: row.brand,
            categoryCode: row.categoryCode,
            // ADR-020 (#88): sin imagen en el CSV se conserva la que haya (por ejemplo, la foto subida).
            ...(product.image
              ? {
                  imageUrl: row.imageUrl,
                  imageSource: row.imageSource,
                  imageAttribution: row.imageAttribution,
                }
              : {}),
          },
        });

      // Grill de la #26: los alias de la semilla reemplazan a los anteriores.
      await tx.delete(productAliases).where(eq(productAliases.productId, product.id));
      const aliases = [...new Set((product.aliases ?? []).map((alias) => alias.trim()))].filter(
        (alias) => alias !== '',
      );
      if (aliases.length > 0) {
        await tx
          .insert(productAliases)
          .values(aliases.map((alias) => ({ productId: product.id, alias })));
      }

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

  async imageUrlOf(productId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ url: products.imageUrl })
      .from(products)
      .where(eq(products.id, productId));
    return row?.url ?? null;
  }

  async listImages(): Promise<{ id: string; image: ProductImage }[]> {
    const rows = await this.db
      .select({
        id: products.id,
        url: products.imageUrl,
        source: products.imageSource,
        attribution: products.imageAttribution,
      })
      .from(products)
      .orderBy(asc(products.id));
    return rows.flatMap((row) =>
      row.url !== null && (row.source === 'open_food_facts' || row.source === 'equipo')
        ? [
            {
              id: row.id,
              image: { url: row.url, source: row.source, attribution: row.attribution ?? '' },
            },
          ]
        : [],
    );
  }

  // ADR-020 (#88): la foto que sube el moderador reemplaza la imagen del producto.
  async setImage(productId: string, image: ProductImage): Promise<void> {
    await this.db
      .update(products)
      .set({ imageUrl: image.url, imageSource: image.source, imageAttribution: image.attribution })
      .where(eq(products.id, productId));
  }
}
