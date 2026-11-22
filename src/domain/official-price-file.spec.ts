import { readPriceFile } from './official-price-file';

describe('archivo de precios oficiales (D7 del grill comercial)', () => {
  it('lee cada fila con su número de Excel, sin espacios ni líneas vacías', () => {
    const file = 'codigo_barras;precio\r\n7702511000014; 2600 \r\n\r\n 7707211000016;8900\r\n';

    expect(readPriceFile(file)).toEqual({
      rows: [
        { row: 2, barcode: '7702511000014', priceCop: 2600 },
        { row: 4, barcode: '7707211000016', priceCop: 8900 },
      ],
      errors: [],
    });
  });
});
