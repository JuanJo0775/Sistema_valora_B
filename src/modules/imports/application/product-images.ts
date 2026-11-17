// Lo que responde Open Food Facts por un código de barras (ADR-020).
export type ImageResult =
  | { status: 'found'; url: string }
  | { status: 'no_image' }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

// Puerto: busca la foto frontal de un producto por su código de barras.
export type ImageLookup = (barcode: string) => Promise<ImageResult>;

export interface ImagesReport {
  // Filas con código de barras que se consultaron.
  withBarcode: number;
  // Productos que quedaron con foto.
  found: string[];
  // Productos que hay que revisar a mano, con el motivo.
  review: string[];
}

const ATTRIBUTION = 'Open Food Facts, CC BY-SA';

const text = (row: Record<string, string>, column: string): string => (row[column] ?? '').trim();
const productName = (row: Record<string, string>): string =>
  [text(row, 'producto'), text(row, 'marca')].filter(Boolean).join(' ');

// #119 (ADR-020): llena el enlace de la foto de cada producto de productos.csv que tiene código de
// barras. Solo guarda el enlace, nunca la foto.
export async function fillProductImages(
  rows: Record<string, string>[],
  lookup: ImageLookup,
): Promise<{ rows: Record<string, string>[]; report: ImagesReport }> {
  const report: ImagesReport = { withBarcode: 0, found: [], review: [] };
  const filled: Record<string, string>[] = [];
  for (const row of rows) {
    const barcode = text(row, 'codigo_barras');
    if (barcode === '') {
      filled.push(row);
      continue;
    }
    report.withBarcode += 1;
    const result = await lookup(barcode);
    if (result.status === 'found') {
      report.found.push(productName(row));
      filled.push({
        ...row,
        imagen_url: result.url,
        imagen_fuente: 'open_food_facts',
        imagen_atribucion: ATTRIBUTION,
      });
    } else {
      filled.push(row);
    }
  }
  return { rows: filled, report };
}
