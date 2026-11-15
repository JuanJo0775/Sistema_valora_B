import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Unit } from '../../../domain/unit-price';
import type {
  PresentationForPricing,
  ProductImage,
  PresentationView,
  ProductForComparisonView,
  ProductRepository,
  ProductSearch,
  ProductView,
} from '../application/product-repository';
import { categories, presentations, products } from './schema';

type PresentationRow = typeof presentations.$inferSelect;

// Nombre y marca normalizados (función de la migración 0006): sin tildes y en minúsculas.
const searchText = sql`catalog.search_text(${products.name}, ${products.brand})`;
// Grill de la #26, pregunta 2: la búsqueda también mira los alias del producto.
const searchable = sql`(${searchText} || ' ' || coalesce((
  select string_agg(catalog.search_text(alias, null), ' ')
  from catalog.product_aliases
  where product_id = ${products.id}
), ''))`;

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
    .map((word) => sql`${searchable} like '%' || trim(catalog.search_text(${word}, null)) || '%'`);
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

  async presentationExists(presentationId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: presentations.id })
      .from(presentations)
      .where(eq(presentations.id, presentationId));
    return found !== undefined;
  }

  async findForComparison(productId: string): Promise<ProductForComparisonView | null> {
    const [product] = await this.db
      .select({ id: products.id, isFresh: categories.isFresh })
      .from(products)
      .innerJoin(categories, eq(products.categoryCode, categories.code))
      .where(eq(products.id, productId));
    if (!product) return null;
    const presentationRows = await this.db
      .select()
      .from(presentations)
      .where(eq(presentations.productId, productId))
      .orderBy(asc(presentations.id));
    return {
      ...product,
      // La comparación no necesita el código de barras.
      presentations: presentationRows
        .map(toPresentationView)
        .map(({ id, quantity, unit, packCount }) => ({ id, quantity, unit, packCount })),
    };
  }

  async isFreshPresentation(presentationId: string): Promise<boolean | null> {
    const [found] = await this.db
      .select({ isFresh: categories.isFresh })
      .from(presentations)
      .innerJoin(products, eq(presentations.productId, products.id))
      .innerJoin(categories, eq(products.categoryCode, categories.code))
      .where(eq(presentations.id, presentationId));
    return found ? found.isFresh : null;
  }

  // Grill de la #32: «Arroz blanco Diana · 500 g» o «… · 6 × 1 kg».
  async labelsOf(presentationIds: string[]): Promise<Map<string, string>> {
    const pricing = await this.pricingOf(presentationIds);
    return new Map([...pricing].map(([id, presentation]) => [id, presentation.label]));
  }

  async pricingOf(presentationIds: string[]): Promise<Map<string, PresentationForPricing>> {
    if (presentationIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: presentations.id,
        productId: products.id,
        name: products.name,
        brand: products.brand,
        quantity: presentations.quantity,
        unit: presentations.unit,
        packCount: presentations.packCount,
        isFresh: categories.isFresh,
      })
      .from(presentations)
      .innerJoin(products, eq(presentations.productId, products.id))
      .innerJoin(categories, eq(products.categoryCode, categories.code))
      .where(inArray(presentations.id, presentationIds));
    return new Map(
      rows.map((row) => {
        const product = row.brand === null ? row.name : `${row.name} ${row.brand}`;
        const quantity = Number(row.quantity);
        const size = `${String(quantity)} ${row.unit}`;
        const pack = row.packCount > 1 ? `${String(row.packCount)} × ${size}` : size;
        return [
          row.id,
          {
            productId: row.productId,
            label: `${product} · ${pack}`,
            quantity,
            // La restricción CHECK de la tabla garantiza que es una de las 5 unidades.
            unit: row.unit as Unit,
            packCount: row.packCount,
            isFresh: row.isFresh,
          },
        ];
      }),
    );
  }

  // Grill de la #52: cada palabra en el nombre o la marca, sin tildes ni mayúsculas (pregunta 1);
  // primero lo que más se parece a lo escrito y, en empate, por nombre (pregunta 4).
  async search(query: ProductSearch): Promise<ProductView[]> {
    const rows = await this.selectProducts()
      .where(and(...wordConditions(query.text)))
      .orderBy(
        desc(sql`similarity(${searchable}, trim(catalog.search_text(${query.text}, null)))`),
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
        imageUrl: products.imageUrl,
        imageSource: products.imageSource,
        imageAttribution: products.imageAttribution,
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
      ...(row.imageUrl && row.imageSource && row.imageAttribution
        ? {
            image: {
              url: row.imageUrl,
              // La restricción CHECK de la tabla garantiza la fuente.
              source: row.imageSource as ProductImage['source'],
              attribution: row.imageAttribution,
            },
          }
        : {}),
      presentations: presentationRows
        .filter((presentation) => presentation.productId === row.id)
        .map(toPresentationView),
    }));
  }
}
