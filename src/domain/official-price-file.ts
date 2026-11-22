import { PLAUSIBILITY_PARAMS } from './price-plausibility';

// D7 del grill comercial (ADR-027): el archivo con el que un comercio publica muchos precios
// oficiales a la vez. Una fila por producto: código de barras y precio, separados por «;» como guarda
// Excel en Colombia (y como los CSV de la semilla).

// Una fila buena; row es el número de la fila en Excel (la 1 es el encabezado).
export interface PriceFileRow {
  row: number;
  barcode: string;
  priceCop: number;
}

export interface PriceFileError {
  row: number;
  barcode: string;
  code: 'INVALID_PRICE' | 'DUPLICATE_ROW' | 'UNKNOWN_BARCODE';
  message: string;
}

export interface PriceFile {
  rows: PriceFileRow[];
  errors: PriceFileError[];
}

const { minPriceCop, maxPriceCop } = PLAUSIBILITY_PARAMS;
const money = new Intl.NumberFormat('es-CO');

// ADR-030: el mismo piso y techo absolutos que un reporte y que un oficial publicado uno a uno.
const isValidPrice = (price: string): boolean =>
  /^\d+$/.test(price) && Number(price) >= minPriceCop && Number(price) <= maxPriceCop;

export function readPriceFile(text: string): PriceFile {
  const rows: PriceFileRow[] = [];
  const errors: PriceFileError[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (index === 0 || line.trim() === '') return;
    const row = index + 1;
    const [barcode = '', price = ''] = line.split(';').map((cell) => cell.trim());
    if (!isValidPrice(price)) {
      errors.push({
        row,
        barcode,
        code: 'INVALID_PRICE',
        message: `El precio debe ser un número entero de pesos entre $${money.format(minPriceCop)} y $${money.format(maxPriceCop)}, sin puntos.`,
      });
      return;
    }
    rows.push({ row, barcode, priceCop: Number(price) });
  });
  return { rows, errors };
}
