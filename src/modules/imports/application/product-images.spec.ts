import { fillProductImages, type ImageLookup, type ImageResult } from './product-images';

// Fila de productos.csv tal como la deja el equipo, sin imagen.
const productRow = (values: Partial<Record<string, string>> = {}): Record<string, string> => ({
  producto: 'Arroz blanco',
  marca: 'Diana',
  codigo_barras: '',
  ...values,
});

// Open Food Facts simulado: responde por código de barras y anota qué se le preguntó.
function fakeLookup(answers: Record<string, ImageResult>) {
  const asked: string[] = [];
  const lookup: ImageLookup = (barcode) => {
    asked.push(barcode);
    return Promise.resolve(answers[barcode] ?? { status: 'not_found' });
  };
  return { lookup, asked };
}

const OFF_PHOTO = 'https://images.openfoodfacts.org/images/products/770/200/102/3456/front_es.jpg';

describe('fotos de Open Food Facts para la semilla (ADR-020, #119)', () => {
  it('con código de barras y foto frontal, la fila guarda el enlace, la fuente y la atribución', async () => {
    const { lookup, asked } = fakeLookup({
      '7702001023456': { status: 'found', url: OFF_PHOTO },
    });

    const result = await fillProductImages(
      [productRow({ codigo_barras: '7702001023456' }), productRow({ producto: 'Panela' })],
      lookup,
    );

    expect(asked).toEqual(['7702001023456']);
    expect(result.rows[0]).toMatchObject({
      imagen_url: OFF_PHOTO,
      imagen_fuente: 'open_food_facts',
      imagen_atribucion: 'Open Food Facts, CC BY-SA',
    });
    expect(result.rows[1]).toEqual(productRow({ producto: 'Panela' }));
    expect(result.report).toEqual({ withBarcode: 1, found: ['Arroz blanco Diana'], review: [] });
  });

  it('sin productos con código de barras no pregunta nada y lo dice', async () => {
    const { lookup, asked } = fakeLookup({});

    const result = await fillProductImages(
      [productRow(), productRow({ producto: 'Panela' })],
      lookup,
    );

    expect(asked).toEqual([]);
    expect(result.report).toEqual({ withBarcode: 0, found: [], review: [] });
  });

  it('sin foto, sin el producto en Open Food Facts o con error de red, lo deja para revisar a mano', async () => {
    const { lookup } = fakeLookup({
      '7702001000001': { status: 'no_image' },
      '7702001000003': { status: 'error', message: 'sin conexión' },
    });

    const rows = [
      productRow({ producto: 'Panela', marca: '', codigo_barras: '7702001000001' }),
      productRow({ producto: 'Sal', marca: 'Refisal', codigo_barras: '7702001000002' }),
      productRow({ producto: 'Aceite', marca: 'Gourmet', codigo_barras: '7702001000003' }),
    ];
    const result = await fillProductImages(rows, lookup);

    expect(result.rows).toEqual(rows);
    expect(result.report).toEqual({
      withBarcode: 3,
      found: [],
      review: [
        'Panela (7702001000001): sin foto frontal en Open Food Facts',
        'Sal Refisal (7702001000002): no está en Open Food Facts',
        'Aceite Gourmet (7702001000003): no se pudo consultar (sin conexión)',
      ],
    });
  });

  it('no reemplaza una imagen ya cargada, aunque esté en otra fila del mismo producto', async () => {
    const { lookup, asked } = fakeLookup({
      '7702001023456': { status: 'found', url: OFF_PHOTO },
      '7702001023463': { status: 'found', url: OFF_PHOTO },
    });
    const team = {
      imagen_url: 'https://valora.example/arroz.webp',
      imagen_fuente: 'equipo',
      imagen_atribucion: 'Equipo Valora',
    };
    const rows = [
      productRow({ codigo_barras: '7702001023456', ...team }),
      productRow({ codigo_barras: '7702001023463' }),
    ];

    const result = await fillProductImages(rows, lookup);

    expect(asked).toEqual([]);
    expect(result.rows).toEqual(rows);
    expect(result.report).toEqual({ withBarcode: 0, found: [], review: [] });
  });

  it('un producto con varias presentaciones toma una sola foto: la de la primera que la tenga', async () => {
    const { lookup, asked } = fakeLookup({
      '7702001023456': { status: 'no_image' },
      '7702001023463': { status: 'found', url: OFF_PHOTO },
      '7702001023470': { status: 'found', url: OFF_PHOTO },
    });

    const result = await fillProductImages(
      [
        productRow({ codigo_barras: '7702001023456' }),
        productRow({ codigo_barras: '7702001023463' }),
        productRow({ codigo_barras: '7702001023470' }),
      ],
      lookup,
    );

    expect(asked).toEqual(['7702001023456', '7702001023463']);
    expect(result.rows.map((row) => row.imagen_url ?? '')).toEqual(['', OFF_PHOTO, '']);
    expect(result.report).toEqual({ withBarcode: 2, found: ['Arroz blanco Diana'], review: [] });
  });
});
