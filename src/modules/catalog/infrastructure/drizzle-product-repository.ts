import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Unit } from '../../../domain/unit-price';
import type {
  PresentationView,
  ProductRepository,
  ProductSearch,
  ProductView,
} from '../application/product-repository';
import { categories, presentations, products } from './schema';

type PresentationRow = typeof presentations.$inferSelect;

// Nombre y marca normalizados (función de la migración 0006): sin tildes y en minúsculas.
const searchText = sql`catalog.search_text(${products.name}, ${products.brand})`;

function toPresentationView(presentation: PresentationRow): PresentationView {
  return {
    id: presentation.id,
    ...(presentation.barcode === null ? {} : { barcode: presentation.barcode }),
    // numeric llega como texto desde pg; la respuesta lo entrega como número.
    quantity: Number(presentation.quantity),
    // La restricción CHECK de la tabla garantiza que es una de las 5 unidades.
    unit: presentation.unit as Unit,
    packCount: presentation.packCount,
  };
}

// Cada palabra debe aparecer; los comodines de LIKE que escribe el usuario se buscan como texto.
function wordConditions(text: string): SQL[] {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.replace(/[\\%_]/g, (wildcard) => `\\${wildcard}`))
    .map((word) => sql`${searchText} like '%' || trim(catalog.search_text(${word}, null)) || '%'`);
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findById(id: string): Promise<ProductView | null> {
    const [product] = await this.withPresentations(
      await this.selectProducts().where(eq(products.id, id)),
    );
    return product ?? null;
  }

  // El código de barras es único (#49): como mucho hay un producto con esa presentación.
  async findByBarcode(barcode: string): Promise<ProductView[]> {
    const [presentation] = await this.db
      .select({ productId: presentations.productId })
      .from(presentations)
      .where(eq(presentations.barcode, barcode));
    if (!presentation) return [];
    const product = await this.findById(presentation.productId);
    return product ? [product] : [];
  }

  // Grill de la #52: cada palabra en el nombre o la marca, sin tildes ni mayúsculas (pregunta 1);
  // primero lo que más se parece a lo escrito y, en empate, por nombre (pregunta 4).
  async search(query: ProductSearch): Promise<ProductView[]> {
    const rows = await this.selectProducts()
      .where(and(...wordConditions(query.text)))
      .orderBy(
        desc(sql`similarity(${searchText}, trim(catalog.search_text(${query.text}, null)))`),
        asc(products.name),
      )
      .limit(query.limit);
    return this.withPresentations(rows);
  }

  private selectProducts() {
    return this.db
      .select({
        id: products.id,
        name: products.name,
        brand: products.brand,
        categoryCode: categories.code,
        categoryName: categories.name,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryCode, categories.code))
      .$dynamic();
  }

  // Lee las presentaciones de todos los productos en una sola consulta, conservando su orden.
  private async withPresentations(
    rows: Awaited<ReturnType<DrizzleProductRepository['selectProducts']>>,
  ): Promise<ProductView[]> {
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
        .map(toPresentationView),
    }));
  }
}
