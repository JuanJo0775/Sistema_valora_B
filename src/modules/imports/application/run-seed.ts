import type { Unit } from '../../../domain/unit-price';
import type { ImportCatalog, ProductImport } from '../../catalog';
import type {
  EstablishmentImport,
  EstablishmentType,
  ImportEstablishments,
} from '../../establishments';
import type { SeedRow, SeedSource } from './seed-source';
import { stableId } from './stable-id';

// Lo que la semilla usa de catalog y establishments, a través de su interfaz pública.
export type SeedCatalog = Pick<ImportCatalog, 'save' | 'listProductIds'> & {
  listCategoryCodes(): Promise<string[]>;
};
export type SeedStores = Pick<ImportEstablishments, 'save' | 'listIds'>;

export interface SeedSummary {
  ok: true;
  stores: { saved: number; skipped: number };
  products: { saved: number; presentations: number; skipped: number };
}

const text = (row: SeedRow, column: string): string => (row.values[column] ?? '').trim();

// Grill de la #51, pregunta 3: solo se cargan las filas que el equipo ya revisó.
const isVerifiedStore = (row: SeedRow): boolean => text(row, 'revisar') === 'no';
const isVerifiedProduct = (row: SeedRow): boolean =>
  text(row, 'verificar') === 'no' && text(row, 'responsable') !== '';

export class RunSeed {
  constructor(
    private readonly source: SeedSource,
    private readonly catalog: SeedCatalog,
    private readonly stores: SeedStores,
  ) {}

  async execute(): Promise<SeedSummary> {
    const storeRows = await this.source.readStores();
    const productRows = await this.source.readProducts();
    const stores = storeRows.filter(isVerifiedStore).map(toStore);
    const verifiedProducts = productRows.filter(isVerifiedProduct);
    const products = groupProducts(verifiedProducts);

    for (const store of stores) await this.stores.save(store);
    for (const product of products) await this.catalog.save(product);

    return {
      ok: true,
      stores: { saved: stores.length, skipped: storeRows.length - stores.length },
      products: {
        saved: products.length,
        presentations: verifiedProducts.length,
        skipped: productRows.length - verifiedProducts.length,
      },
    };
  }
}

function toStore(row: SeedRow): EstablishmentImport {
  const address = text(row, 'direccion');
  return {
    id: stableId('establishment', text(row, 'osm_id')),
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
    const id = stableId('product', name.toLowerCase(), brand.toLowerCase());
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
