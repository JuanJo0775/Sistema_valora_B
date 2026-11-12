import type { ProductImport } from '../../catalog';
import type { EstablishmentImport } from '../../establishments';
import { RunSeed, type SeedCatalog, type SeedStores } from './run-seed';
import type { SeedRow, SeedSource } from './seed-source';
import { stableId } from './stable-id';

class InMemorySource implements SeedSource {
  constructor(
    private readonly products: SeedRow[] = [],
    private readonly stores: SeedRow[] = [],
  ) {}

  readProducts(): Promise<SeedRow[]> {
    return Promise.resolve(this.products);
  }

  readStores(): Promise<SeedRow[]> {
    return Promise.resolve(this.stores);
  }
}

class InMemoryStores implements SeedStores {
  readonly saved: EstablishmentImport[] = [];
  constructor(private readonly existingIds: string[] = []) {}

  save(store: EstablishmentImport): Promise<void> {
    this.saved.push(store);
    return Promise.resolve();
  }

  listIds(): Promise<string[]> {
    return Promise.resolve(this.existingIds);
  }
}

class InMemoryCatalog implements SeedCatalog {
  readonly saved: ProductImport[] = [];
  constructor(private readonly existingIds: string[] = []) {}

  save(product: ProductImport): Promise<void> {
    this.saved.push(product);
    return Promise.resolve();
  }

  listProductIds(): Promise<string[]> {
    return Promise.resolve(this.existingIds);
  }

  listCategoryCodes(): Promise<string[]> {
    return Promise.resolve(['grains-groceries', 'dairy-eggs']);
  }
}

// Fila de tiendas.csv tal como la deja el equipo; la línea 1 es el encabezado.
const storeRow = (line: number, values: Partial<Record<string, string>> = {}): SeedRow => ({
  line,
  values: {
    osm_id: `node/${String(line)}`,
    nombre: 'Tienda de prueba',
    tipo: 'barrio',
    direccion: '',
    lat: '4.5339',
    lng: '-75.6811',
    tipo_osm: 'general',
    revisar: 'no',
    fuente: '© colaboradores de OpenStreetMap, ODbL',
    fecha_consulta: '2026-11-12',
    ...values,
  },
});

// Fila de productos.csv verificada por el equipo; la línea 1 es el encabezado.
const productRow = (line: number, values: Partial<Record<string, string>> = {}): SeedRow => ({
  line,
  values: {
    producto: 'Arroz de prueba',
    marca: 'Marca de prueba',
    categoria: 'grains-groceries',
    cantidad: '500',
    unidad: 'g',
    unidades_empaque: '1',
    codigo_barras: '',
    verificar: 'no',
    fuente: 'Visita a tienda de prueba',
    responsable: 'Integrante de prueba',
    fecha: '2026-11-12',
    ...values,
  },
});

describe('semilla de datos iniciales', () => {
  it('guarda la tienda verificada con su id fijo y salta la pendiente de revisar', async () => {
    const stores = new InMemoryStores();
    const seed = new RunSeed(
      new InMemorySource([], [storeRow(2), storeRow(3, { revisar: 'sí' })]),
      new InMemoryCatalog(),
      stores,
    );

    const result = await seed.execute();

    expect(stores.saved).toEqual([
      {
        id: stableId('establishment', 'node/2'),
        name: 'Tienda de prueba',
        type: 'barrio',
        lat: 4.5339,
        lng: -75.6811,
      },
    ]);
    expect(result).toMatchObject({ ok: true, stores: { saved: 1, skipped: 1 } });
  });

  it('guarda el producto verificado con todas sus presentaciones y salta el que no tiene responsable', async () => {
    const catalog = new InMemoryCatalog();
    const seed = new RunSeed(
      new InMemorySource([
        productRow(2),
        productRow(3, { cantidad: '1', unidad: 'kg', codigo_barras: '7702511000014' }),
        productRow(4, { producto: 'Leche de prueba', categoria: 'dairy-eggs', responsable: '' }),
      ]),
      catalog,
      new InMemoryStores(),
    );

    const result = await seed.execute();

    const productId = stableId('product', 'arroz de prueba', 'marca de prueba');
    expect(catalog.saved).toEqual([
      {
        id: productId,
        name: 'Arroz de prueba',
        brand: 'Marca de prueba',
        categoryCode: 'grains-groceries',
        presentations: [
          {
            id: stableId('presentation', productId, '500', 'g', '1'),
            quantity: 500,
            unit: 'g',
            packCount: 1,
          },
          {
            id: stableId('presentation', productId, '1', 'kg', '1'),
            barcode: '7702511000014',
            quantity: 1,
            unit: 'kg',
            packCount: 1,
          },
        ],
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      products: { saved: 1, presentations: 2, skipped: 1 },
    });
  });
});
