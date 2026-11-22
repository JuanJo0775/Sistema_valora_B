import {
  InvalidPriceFileError,
  PriceFileTooLargeError,
  readPriceFile,
} from './official-price-file';

const fileWith = (rows: number) =>
  ['codigo_barras;precio', ...Array.from({ length: rows }, (_, i) => `${String(i)};2600`)].join(
    '\n',
  );

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

  it('un precio que no es un número entero de pesos, o fuera de $100 a $5.000.000, es un error de esa fila', () => {
    const file = 'codigo_barras;precio\n111;2.600\n222;50\n333;6000000\n444;\n555;2600';

    const { rows, errors } = readPriceFile(file);

    expect(rows).toEqual([{ row: 6, barcode: '555', priceCop: 2600 }]);
    expect(errors.map(({ row, barcode, code }) => [row, barcode, code])).toEqual([
      [2, '111', 'INVALID_PRICE'],
      [3, '222', 'INVALID_PRICE'],
      [4, '333', 'INVALID_PRICE'],
      [5, '444', 'INVALID_PRICE'],
    ]);
    expect(errors[0]?.message).toBe(
      'El precio debe ser un número entero de pesos entre $100 y $5.000.000, sin puntos.',
    );
  });

  it('un código de barras repetido: vale la primera fila y las siguientes son error', () => {
    const file = 'codigo_barras;precio\n111;2600\n222;3000\n111;2700';

    const { rows, errors } = readPriceFile(file);

    expect(rows.map((r) => [r.row, r.barcode, r.priceCop])).toEqual([
      [2, '111', 2600],
      [3, '222', 3000],
    ]);
    expect(errors).toEqual([
      {
        row: 4,
        barcode: '111',
        code: 'DUPLICATE_ROW',
        message: 'Este código de barras ya está en la fila 2.',
      },
    ]);
  });

  it('hasta 1.000 filas se lee; con 1.001 se rechaza el archivo completo', () => {
    expect(readPriceFile(fileWith(1000)).rows).toHaveLength(1000);
    expect(() => readPriceFile(fileWith(1001))).toThrow(PriceFileTooLargeError);
  });

  // Excel en otro idioma separa con coma: el encabezado lo delata antes de leer mal las filas.
  it.each([
    ['vacío', ''],
    ['separado con comas', 'codigo_barras,precio\n111,2600'],
    ['sin encabezado', '111;2600'],
  ])('un archivo %s se rechaza completo', (_case, file) => {
    expect(() => readPriceFile(file)).toThrow(InvalidPriceFileError);
  });

  it('el encabezado no distingue mayúsculas, espacios ni la marca de Excel al inicio', () => {
    expect(readPriceFile('﻿ Codigo_Barras ; Precio \n111;2600').rows).toHaveLength(1);
  });
});
