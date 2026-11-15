import type { ProductImport, WholesaleReference } from '../../catalog';
import type { EstablishmentImport } from '../../establishments';
import { RunSeed, type SeedCatalog, type SeedStores } from './run-seed';
import type { SeedRow, SeedSource } from './seed-source';
import { stableId } from './stable-id';

class InMemorySource implements SeedSource {
  constructor(
    private readonly products: SeedRow[] = [],
    private readonly stores: SeedRow[] = [],
    private readonly references: SeedRow[] = [],
  ) {}

  readReferences(): Promise<SeedRow[]> {
    return Promise.resolve(this.references);
  }

  readSample(): Promise<SeedRow[]> {
    return Promise.resolve([]);
  }

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
  readonly savedReferences: WholesaleReference[] = [];

  saveReference(reference: WholesaleReference): Promise<void> {
    this.savedReferences.push(reference);
    return Promise.resolve();
  }

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

  it.each([
    [
      'código de barras con dígito de control equivocado',
      [productRow(2, { codigo_barras: '7702511000015' })],
      [],
      'productos.csv, fila 2: el código de barras «7702511000015» no es válido',
    ],
    [
      'categoría que no existe',
      [productRow(2, { categoria: 'snacks' })],
      [],
      'productos.csv, fila 2: la categoría «snacks» no existe',
    ],
    [
      'unidad desconocida',
      [productRow(2, { unidad: 'lb' })],
      [],
      'productos.csv, fila 2: la unidad «lb» no es válida (g, kg, ml, l o und)',
    ],
    [
      'cantidad que no es positiva',
      [productRow(2, { cantidad: '0' })],
      [],
      'productos.csv, fila 2: la cantidad debe ser un número mayor que 0',
    ],
    [
      'unidades del empaque no enteras',
      [productRow(2, { unidades_empaque: '1.5' })],
      [],
      'productos.csv, fila 2: unidades_empaque debe ser un entero mayor o igual a 1',
    ],
    [
      'producto sin fuente',
      [productRow(2, { fuente: '' })],
      [],
      'productos.csv, fila 2: falta la fuente',
    ],
    [
      'producto con fecha mal escrita',
      [productRow(2, { fecha: '12/11/2026' })],
      [],
      'productos.csv, fila 2: la fecha debe tener el formato AAAA-MM-DD',
    ],
    [
      'código de barras repetido en el archivo',
      [
        productRow(2, { codigo_barras: '7702511000014' }),
        productRow(3, { cantidad: '1', unidad: 'kg', codigo_barras: '7702511000014' }),
      ],
      [],
      'productos.csv, fila 3: el código de barras «7702511000014» ya está en la fila 2',
    ],
    [
      'producto con dos categorías',
      [productRow(2), productRow(3, { cantidad: '1', unidad: 'kg', categoria: 'dairy-eggs' })],
      [],
      'productos.csv, fila 3: «Arroz de prueba» ya tiene la categoría grains-groceries en la fila 2',
    ],
    // Issue #59: un producto no mezcla bases de unidad.
    [
      'producto con bases de unidad distintas',
      [productRow(2), productRow(3, { cantidad: '6', unidad: 'und' })],
      [],
      'productos.csv, fila 3: «Arroz de prueba» mezcla bases de unidad: 100g en la fila 2 y und aquí',
    ],
    // Grill de la #26, pregunta 1: la imagen trae su fuente y su atribución (ADR-020).
    [
      'imagen con una fuente desconocida',
      [
        productRow(2, {
          imagen_url: 'https://imagenes.ejemplo.com/arroz.webp',
          imagen_fuente: 'internet',
          imagen_atribucion: 'Alguien',
        }),
      ],
      [],
      'productos.csv, fila 2: la fuente de la imagen «internet» no es válida (open_food_facts o equipo)',
    ],
    [
      'imagen sin https o sin atribución',
      [
        productRow(2, {
          imagen_url: 'http://imagenes.ejemplo.com/arroz.webp',
          imagen_fuente: 'equipo',
          imagen_atribucion: '',
        }),
      ],
      [],
      'productos.csv, fila 2: la imagen necesita una URL https y su atribución',
    ],
    [
      'tienda con tipo desconocido',
      [],
      [storeRow(2, { tipo: 'tienda' })],
      'tiendas.csv, fila 2: el tipo «tienda» no es válido (barrio, minimercado, supermercado o descuento)',
    ],
    [
      'tienda con coordenadas fuera de rango',
      [],
      [storeRow(2, { lat: '95' })],
      'tiendas.csv, fila 2: las coordenadas no son válidas',
    ],
    [
      'tienda sin nombre',
      [],
      [storeRow(2, { nombre: '' })],
      'tiendas.csv, fila 2: falta el nombre',
    ],
    [
      'tienda sin fuente',
      [],
      [storeRow(2, { fuente: '' })],
      'tiendas.csv, fila 2: falta la fuente',
    ],
  ])(
    'una fila verificada con %s no deja guardar nada y nombra la fila',
    async (_case, products, stores, error) => {
      const catalog = new InMemoryCatalog();
      const storesTarget = new InMemoryStores();
      const seed = new RunSeed(
        new InMemorySource(
          [productRow(10, { producto: 'Otro producto' }), ...products],
          [storeRow(20), ...stores],
        ),
        catalog,
        storesTarget,
      );

      const result = await seed.execute();

      expect(result).toEqual({ ok: false, errors: [error] });
      expect(catalog.saved).toEqual([]);
      expect(storesTarget.saved).toEqual([]);
    },
  );

  it('informa los registros de la base que ya no están en los CSV, sin borrarlos', async () => {
    const keptStore = stableId('establishment', 'node/2');
    const keptProduct = stableId('product', 'arroz de prueba', 'marca de prueba');
    const stores = new InMemoryStores([keptStore, 'a0000000-0000-4000-8000-000000000001']);
    const catalog = new InMemoryCatalog([
      keptProduct,
      'b0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
    ]);
    const seed = new RunSeed(
      // Una fila pendiente sigue «estando en el CSV»: no se informa como ausente.
      new InMemorySource([productRow(2, { verificar: 'sí' })], [storeRow(2)]),
      catalog,
      stores,
    );

    const result = await seed.execute();

    expect(result).toMatchObject({ ok: true, notInFiles: { stores: 1, products: 2 } });
  });

  // Grill de la #26, preguntas 1 y 2.
  it('los alias y la imagen de productos.csv llegan al producto', async () => {
    const catalog = new InMemoryCatalog();
    const seed = new RunSeed(
      new InMemorySource(
        [
          productRow(2, {
            alias: 'Arroz de mesa | Arroz blanco',
            imagen_url: 'https://images.openfoodfacts.org/arroz.jpg',
            imagen_fuente: 'open_food_facts',
            imagen_atribucion: 'Open Food Facts, CC BY-SA',
          }),
          productRow(3, { cantidad: '1', unidad: 'kg', alias: 'Arroz de mesa|Arroz grano largo' }),
        ],
        [storeRow(20)],
      ),
      catalog,
      new InMemoryStores(),
    );

    await seed.execute();

    expect(catalog.saved).toMatchObject([
      {
        aliases: ['Arroz de mesa', 'Arroz blanco', 'Arroz grano largo'],
        image: {
          url: 'https://images.openfoodfacts.org/arroz.jpg',
          source: 'open_food_facts',
          attribution: 'Open Food Facts, CC BY-SA',
        },
      },
    ]);
  });

  // Grill de la #34 (RF-014): referencias SIPSA cargadas a mano desde el boletín.
  describe('sipsa.csv', () => {
    const referenceRow = (line: number, values: Partial<Record<string, string>> = {}): SeedRow => ({
      line,
      values: {
        producto: 'Arroz de prueba',
        marca: 'Marca de prueba',
        producto_sipsa: 'Arroz blanco',
        mercado: 'Armenia, Mercar',
        inicio_periodo: '2026-11-09',
        fin_periodo: '2026-11-15',
        precio_kg: '3200',
        url_fuente: 'https://www.dane.gov.co/sipsa/boletin.xlsx',
        verificar: 'no',
        responsable: 'Integrante de prueba',
        fecha_consulta: '2026-11-15',
        ...values,
      },
    });
    const run = (products: SeedRow[], references: SeedRow[]) => {
      const catalog = new InMemoryCatalog();
      const seed = new RunSeed(
        new InMemorySource(products, [], references),
        catalog,
        new InMemoryStores(),
      );
      return { catalog, result: seed.execute() };
    };

    it('guarda la referencia verificada como precio por kilo del producto y salta la pendiente', async () => {
      const { catalog, result } = run(
        [productRow(2)],
        [referenceRow(2), referenceRow(3, { verificar: 'sí' })],
      );

      await expect(result).resolves.toMatchObject({
        ok: true,
        references: { saved: 1, skipped: 1 },
      });
      const productId = stableId('product', 'arroz de prueba', 'marca de prueba');
      expect(catalog.savedReferences).toEqual([
        {
          id: stableId('wholesale-reference', productId, 'armenia, mercar', '2026-11-09'),
          productId,
          sipsaName: 'Arroz blanco',
          market: 'Armenia, Mercar',
          periodStart: '2026-11-09',
          periodEnd: '2026-11-15',
          pricePerKgCop: 3200,
          sourceUrl: 'https://www.dane.gov.co/sipsa/boletin.xlsx',
          responsible: 'Integrante de prueba',
          consultedAt: '2026-11-15',
        },
      ]);
    });

    it.each([
      [
        'un producto que no está verificado en productos.csv',
        [productRow(2)],
        referenceRow(2, { marca: 'Otra marca' }),
        'sipsa.csv, fila 2: el producto «Arroz de prueba» de «Otra marca» no está verificado en productos.csv',
      ],
      [
        'un producto que no se vende por peso',
        [productRow(2, { cantidad: '400', unidad: 'ml' })],
        referenceRow(2),
        'sipsa.csv, fila 2: «Arroz de prueba» no se vende por peso; SIPSA da precios por kilo',
      ],
      [
        'un precio que no es un entero mayor que 0',
        [productRow(2)],
        referenceRow(2, { precio_kg: '0' }),
        'sipsa.csv, fila 2: precio_kg debe ser un entero mayor que 0',
      ],
      [
        'un periodo al revés',
        [productRow(2)],
        referenceRow(2, { inicio_periodo: '2026-11-16' }),
        'sipsa.csv, fila 2: el periodo debe tener fechas AAAA-MM-DD y no puede empezar después de terminar',
      ],
      [
        'una fuente sin https',
        [productRow(2)],
        referenceRow(2, { url_fuente: 'http://www.dane.gov.co/sipsa.xlsx' }),
        'sipsa.csv, fila 2: url_fuente debe ser una URL https',
      ],
      [
        'sin el nombre de SIPSA o sin mercado',
        [productRow(2)],
        referenceRow(2, { mercado: '' }),
        'sipsa.csv, fila 2: faltan producto_sipsa o mercado',
      ],
      [
        'una fecha de consulta inválida',
        [productRow(2)],
        referenceRow(2, { fecha_consulta: '15/11/2026' }),
        'sipsa.csv, fila 2: la fecha debe tener el formato AAAA-MM-DD',
      ],
    ])(
      'rechaza %s, nombrando la fila, y no guarda nada',
      async (_case, products, reference, error) => {
        const { catalog, result } = run(products, [reference]);

        await expect(result).resolves.toEqual({ ok: false, errors: [error] });
        expect(catalog.saved).toEqual([]);
        expect(catalog.savedReferences).toEqual([]);
      },
    );
  });
});
