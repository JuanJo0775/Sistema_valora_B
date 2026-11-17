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
});
