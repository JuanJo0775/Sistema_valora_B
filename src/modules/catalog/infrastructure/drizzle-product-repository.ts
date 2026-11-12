import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Unit } from '../../../domain/unit-price';
import type {
  PresentationView,
  ProductRepository,
  ProductSearch,
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

  // Grill de la #52, pregunta 1: cada palabra debe aparecer en el nombre o la marca, sin tildes ni mayúsculas.
  async search(query: ProductSearch): Promise<ProductView[]> {
    const searchText = sql`catalog.search_text(${products.name}, ${products.brand})`;
    const conditions: SQL[] = query.text
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map(
        (word) => sql`${searchText} like '%' || trim(catalog.search_text(${word}, null)) || '%'`,
      );

    const rows = await this.db
      .select({
        id: products.id,
        name: products.name,
        brand: products.brand,
        categoryCode: categories.code,
        categoryName: categories.name,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryCode, categories.code))
      .where(and(...conditions));
    if (rows.length === 0) return [];

    const presentationRows = await this.db
      .select()
      .from(presentations)
      .where(
        inArray(
          presentations.productId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(presentations.id));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      ...(row.brand === null ? {} : { brand: row.brand }),
      category: { code: row.categoryCode, name: row.categoryName },
      presentations: presentationRows
        .filter((presentation) => presentation.productId === row.id)
        .map((presentation): PresentationView => ({
          id: presentation.id,
          ...(presentation.barcode === null ? {} : { barcode: presentation.barcode }),
          quantity: Number(presentation.quantity),
          unit: presentation.unit as Unit,
          packCount: presentation.packCount,
        })),
    }));
  }
}
