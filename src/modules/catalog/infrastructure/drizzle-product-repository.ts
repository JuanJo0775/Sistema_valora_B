import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Unit } from '../../../domain/unit-price';
import type {
  PresentationView,
  ProductRepository,
  ProductView,
} from '../application/product-repository';
import { categories, presentations, products } from './schema';

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findById(id: string): Promise<ProductView | null> {
    const [row] = await this.db
      .select({
        id: products.id,
        name: products.name,
        brand: products.brand,
        categoryCode: categories.code,
        categoryName: categories.name,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryCode, categories.code))
      .where(eq(products.id, id));
    if (!row) return null;

    const presentationRows = await this.db
      .select()
      .from(presentations)
      .where(eq(presentations.productId, id))
      .orderBy(asc(presentations.id));

    return {
      id: row.id,
      name: row.name,
      ...(row.brand === null ? {} : { brand: row.brand }),
      category: { code: row.categoryCode, name: row.categoryName },
      presentations: presentationRows.map((presentation): PresentationView => ({
        id: presentation.id,
        ...(presentation.barcode === null ? {} : { barcode: presentation.barcode }),
        // numeric llega como texto desde pg; la respuesta lo entrega como número.
        quantity: Number(presentation.quantity),
        // La restricción CHECK de la tabla garantiza que es una de las 5 unidades.
        unit: presentation.unit as Unit,
        packCount: presentation.packCount,
      })),
    };
  }
}
