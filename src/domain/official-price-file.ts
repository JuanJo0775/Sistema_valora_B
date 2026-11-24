import { PLAUSIBILITY_PARAMS } from './price-plausibility';

const money = new Intl.NumberFormat('es-CO');

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
  code: 'INVALID_PRICE' | 'DUPLICATE_ROW' | 'UNKNOWN_BARCODE' | 'IMPLAUSIBLE_OFFICIAL_PRICE';
  message: string;
}

export interface PriceFile {
  rows: PriceFileRow[];
  errors: PriceFileError[];
}

// D7: se procesa al momento, así que el archivo tiene un tope. Valor PROVISIONAL.
export const MAX_PRICE_FILE_ROWS = 1000;

// El archivo completo se rechaza: la capa HTTP lo traduce a 413.
export class PriceFileTooLargeError extends Error {
  constructor() {
    super(
      `El archivo tiene más de ${money.format(MAX_PRICE_FILE_ROWS)} filas: divídelo en varios archivos.`,
    );
    this.name = 'PriceFileTooLargeError';
  }
}

// Archivo sin el encabezado esperado: la capa HTTP lo traduce a 400.
export class InvalidPriceFileError extends Error {
  constructor() {
    super(
      'La primera fila debe ser codigo_barras;precio. Guarda el archivo como «CSV UTF-8» separado por punto y coma.',
    );
    this.name = 'InvalidPriceFileError';
  }
}

const HEADER = 'codigo_barras;precio';

// La marca de orden de bytes que Excel agrega al inicio de un «CSV UTF-8».
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

// Sin esa marca, sin espacios y en minúsculas.
const normalizedHeader = (line: string): string =>
  (line.startsWith(BYTE_ORDER_MARK) ? line.slice(1) : line).replace(/\s/g, '').toLowerCase();

const { minPriceCop, maxPriceCop } = PLAUSIBILITY_PARAMS;
// ADR-030: el mismo piso y techo absolutos que un reporte y que un oficial publicado uno a uno.
const isValidPrice = (price: string): boolean =>
  /^\d+$/.test(price) && Number(price) >= minPriceCop && Number(price) <= maxPriceCop;

const INVALID_PRICE_MESSAGE = `El precio debe ser un número entero de pesos entre $${money.format(minPriceCop)} y $${money.format(maxPriceCop)}, sin puntos.`;

// Las filas con datos, con su número de Excel. El archivo completo se rechaza si no se puede leer.
function dataLines(text: string): { row: number; cells: string[] }[] {
  const lines = text.split(/\r?\n/);
  if (normalizedHeader(lines[0] ?? '') !== HEADER) throw new InvalidPriceFileError();
  const data = lines
    .map((line, index) => ({ row: index + 1, line }))
    .filter(({ row, line }) => row > 1 && line.trim() !== '');
  if (data.length > MAX_PRICE_FILE_ROWS) throw new PriceFileTooLargeError();
  return data.map(({ row, line }) => ({ row, cells: line.split(';').map((cell) => cell.trim()) }));
}

export function readPriceFile(text: string): PriceFile {
  const rows: PriceFileRow[] = [];
  const errors: PriceFileError[] = [];
  // La fila donde apareció cada código por primera vez.
  const firstRow = new Map<string, number>();
  for (const { row, cells } of dataLines(text)) {
    const [barcode = '', price = ''] = cells;
    const first = firstRow.get(barcode);
    if (!isValidPrice(price)) {
      errors.push({ row, barcode, code: 'INVALID_PRICE', message: INVALID_PRICE_MESSAGE });
    } else if (first !== undefined) {
      const message = `Este código de barras ya está en la fila ${String(first)}.`;
      errors.push({ row, barcode, code: 'DUPLICATE_ROW', message });
    } else {
      firstRow.set(barcode, row);
      rows.push({ row, barcode, priceCop: Number(price) });
    }
  }
  return { rows, errors };
}
