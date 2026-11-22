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

export function readPriceFile(text: string): PriceFile {
  const rows: PriceFileRow[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (index === 0 || line.trim() === '') return;
    const [barcode = '', price = ''] = line.split(';').map((cell) => cell.trim());
    rows.push({ row: index + 1, barcode, priceCop: Number(price) });
  });
  return { rows, errors: [] };
}
