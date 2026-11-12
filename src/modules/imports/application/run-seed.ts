import type { Unit } from '../../../domain/unit-price';
import type { ImportCatalog, ProductImport } from '../../catalog';
import type {
  EstablishmentImport,
  EstablishmentType,
  ImportEstablishments,
} from '../../establishments';
import { isVerifiedProduct, isVerifiedStore, productErrors, storeErrors, text } from './seed-rows';
import type { SeedRow, SeedSource } from './seed-source';
import { stableId } from './stable-id';

// Lo que la semilla usa de catalog y establishments, a través de su interfaz pública.
export type SeedCatalog = Pick<ImportCatalog, 'save' | 'listProductIds' | 'listCategoryCodes'>;
export type SeedStores = Pick<ImportEstablishments, 'save' | 'listIds'>;

export interface SeedFailure {
  ok: false;
  errors: string[];
}

export interface SeedSummary {
  ok: true;
  stores: { saved: number; skipped: number };
  products: { saved: number; presentations: number; skipped: number };
  // Grill de la #51, pregunta 4: se informan, nunca se borran.
  notInFiles: { stores: number; products: number };
}

export class RunSeed {
  constructor(
    private readonly source: SeedSource,
    private readonly catalog: SeedCatalog,
    private readonly stores: SeedStores,
  ) {}

  async execute(): Promise<SeedSummary | SeedFailure> {
    const storeRows = await this.source.readStores();
    const productRows = await this.source.readProducts();
    const verifiedStores = storeRows.filter(isVerifiedStore);
    const verifiedProducts = productRows.filter(isVerifiedProduct);

    // Todo o nada: con una sola fila inválida no se guarda nada y se listan todos los errores.
    const errors = [
      ...productErrors(verifiedProducts, await this.catalog.listCategoryCodes()),
      ...storeErrors(verifiedStores),
    ];
    if (errors.length > 0) return { ok: false, errors };

    const stores = verifiedStores.map(toStore);
    const products = groupProducts(verifiedProducts);

    for (const store of stores) await this.stores.save(store);
    for (const product of products) await this.catalog.save(product);

    const storeIdsInFile = new Set(storeRows.map(storeId));
    const productIdsInFile = new Set(productRows.map(productId));
    const missing = (ids: string[], inFile: Set<string>): number =>
      ids.filter((id) => !inFile.has(id)).length;

    return {
      ok: true,
      stores: { saved: stores.length, skipped: storeRows.length - stores.length },
      products: {
        saved: products.length,
        presentations: verifiedProducts.length,
        skipped: productRows.length - verifiedProducts.length,
      },
      notInFiles: {
        stores: missing(await this.stores.listIds(), storeIdsInFile),
        products: missing(await this.catalog.listProductIds(), productIdsInFile),
      },
    };
  }
}

// Ids fijos (grill de la #51, pregunta 2): tienda por osm_id; producto por nombre y marca.
const storeId = (row: SeedRow): string => stableId('establishment', text(row, 'osm_id'));
const productId = (row: SeedRow): string =>
  stableId('product', text(row, 'producto').toLowerCase(), text(row, 'marca').toLowerCase());

function toStore(row: SeedRow): EstablishmentImport {
  const address = text(row, 'direccion');
  return {
    id: storeId(row),
    name: text(row, 'nombre'),
    type: text(row, 'tipo') as EstablishmentType,
    ...(address === '' ? {} : { address }),
    lat: Number(text(row, 'lat')),
    lng: Number(text(row, 'lng')),
  };
}

// Una fila es una presentación; las filas con el mismo nombre y marca son un solo producto.
function groupProducts(rows: SeedRow[]): ProductImport[] {
  const byId = new Map<string, ProductImport>();
  for (const row of rows) {
    const name = text(row, 'producto');
    const brand = text(row, 'marca');
    const id = productId(row);
    const product = byId.get(id) ?? {
      id,
      name,
      ...(brand === '' ? {} : { brand }),
      categoryCode: text(row, 'categoria'),
      presentations: [],
    };
    const quantity = text(row, 'cantidad');
    const unit = text(row, 'unidad');
    const packCount = text(row, 'unidades_empaque');
    const barcode = text(row, 'codigo_barras');
    product.presentations.push({
      id: stableId('presentation', id, quantity, unit, packCount),
      ...(barcode === '' ? {} : { barcode }),
      quantity: Number(quantity),
      unit: unit as Unit,
      packCount: Number(packCount),
    });
    byId.set(id, product);
  }
  return [...byId.values()];
}
