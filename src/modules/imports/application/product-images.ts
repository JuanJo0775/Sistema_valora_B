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

const REASONS: Record<Exclude<ImageResult['status'], 'found'>, string> = {
  no_image: 'sin foto frontal en Open Food Facts',
  not_found: 'no está en Open Food Facts',
  error: 'no se pudo consultar',
};

const reason = (result: Exclude<ImageResult, { status: 'found' }>): string =>
  result.status === 'error' ? `${REASONS.error} (${result.message})` : REASONS[result.status];

// #119 (ADR-020): llena el enlace de la foto de cada producto de productos.csv que tiene código de
// barras. Solo guarda el enlace, nunca la foto. Un producto (nombre y marca) tiene una sola imagen:
// la semilla toma la de su primera fila que la trae, así que nunca se pisa una ya cargada.
export async function fillProductImages(
  rows: Record<string, string>[],
  lookup: ImageLookup,
): Promise<{ rows: Record<string, string>[]; report: ImagesReport }> {
  const withImage = new Set(
    rows.filter((row) => text(row, 'imagen_url') !== '').map((row) => productName(row)),
  );
  const pending = new Map<string, string[]>();
  let withBarcode = 0;
  const found: string[] = [];
  const filled: Record<string, string>[] = [];
  for (const row of rows) {
    const name = productName(row);
    const barcode = text(row, 'codigo_barras');
    if (barcode === '' || withImage.has(name)) {
      filled.push(row);
      continue;
    }
    withBarcode += 1;
    const result = await lookup(barcode);
    if (result.status !== 'found') {
      pending.set(name, [...(pending.get(name) ?? []), `${name} (${barcode}): ${reason(result)}`]);
      filled.push(row);
      continue;
    }
    withImage.add(name);
    pending.delete(name);
    found.push(name);
    filled.push({
      ...row,
      imagen_url: result.url,
      imagen_fuente: 'open_food_facts',
      imagen_atribucion: ATTRIBUTION,
    });
  }
  return { rows: filled, report: { withBarcode, found, review: [...pending.values()].flat() } };
}
