import { at, isValidDate, isVerifiedProduct, isVerifiedStore, text } from './seed-rows';
import { presentationId, storeId } from './seed-ids';
import type { SeedRow } from './seed-source';
import { stableId } from './stable-id';

export const INITIAL_PRICES_FILE = 'precios-iniciales.csv';

// B#135: un precio de la semilla («Dato inicial»), listo para guardarse en una tienda.
export interface InitialPrice {
  // Id fijo: presentación, tienda y fecha. Repetir la semilla no duplica.
  id: string;
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  observedAt: Date;
  sourceUrl: string;
}

export type InitialPricesResult =
  { ok: true; prices: InitialPrice[]; skipped: number } | { ok: false; errors: string[] };

const MATCHES = ['exacta', 'equivalente'];
const INTEGER = /^\d+$/;

// Sin tildes ni mayúsculas, y en palabras: «Tienda D1 - Centro» → ["tienda", "d1", "centro"].
const words = (value: string): string[] =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Una tienda es de la cadena si su nombre trae el nombre de la cadena como palabra completa:
// «Tienda D1 - Centro» es de D1; «Panadería D10» no.
export function isChainStore(storeName: string, chain: string): boolean {
  const name = words(storeName);
  const target = words(chain);
  return name.some((_, start) => target.every((word, i) => name[start + i] === word));
}

// Igual que la presentación de productos.csv: «Arroz blanco Diana 500 g ×1».
const describe = (row: SeedRow): string =>
  [text(row, 'producto'), text(row, 'marca'), `${text(row, 'cantidad')} ${text(row, 'unidad')}`]
    .filter(Boolean)
    .join(' ') + ` ×${text(row, 'unidades_empaque')}`;

function rowErrors(row: SeedRow, presentations: Set<string>, chainStores: SeedRow[]): string[] {
  const error = (message: string) => at(INITIAL_PRICES_FILE, row, message);
  const errors: string[] = [];
  if (!presentations.has(presentationId(row))) {
    errors.push(error(`el producto «${describe(row)}» no está verificado en productos.csv`));
  }
  if (chainStores.length === 0) {
    errors.push(
      error(`ninguna tienda revisada de tiendas.csv es de la cadena «${text(row, 'cadena')}»`),
    );
  }
  const priceText = text(row, 'precio');
  if (!INTEGER.test(priceText) || Number(priceText) <= 0) {
    errors.push(error('el precio debe ser un entero mayor que cero, en pesos y sin puntos'));
  }
  // EC-06 y ADR-009: una promoción nunca entra como precio normal.
  if (text(row, 'es_oferta') !== 'no') {
    errors.push(error('las ofertas no se cargan como precio normal (EC-06, ADR-009)'));
  }
  if (!isValidDate(text(row, 'fecha_consulta'))) {
    errors.push(error('la fecha debe tener el formato AAAA-MM-DD'));
  }
  if (!text(row, 'url_fuente').startsWith('https://')) {
    errors.push(error('la fuente debe ser un enlace https'));
  }
  if (!MATCHES.includes(text(row, 'coincidencia'))) {
    errors.push(error('la coincidencia debe ser «exacta» o «equivalente»'));
  }
  return errors;
}

// B#135: los precios de precios-iniciales.csv, uno por cada tienda revisada de su cadena. Como el
// resto de la semilla: solo las filas revisadas, y todo o nada si alguna tiene un error.
export function initialPricesFrom(
  priceRows: SeedRow[],
  productRows: SeedRow[],
  storeRows: SeedRow[],
): InitialPricesResult {
  const verified = priceRows.filter(isVerifiedProduct);
  const presentations = new Set(productRows.filter(isVerifiedProduct).map(presentationId));
  const stores = storeRows.filter(isVerifiedStore);
  const storesOf = (row: SeedRow) =>
    stores.filter((store) => isChainStore(text(store, 'nombre'), text(row, 'cadena')));

  const errors = verified.flatMap((row) => rowErrors(row, presentations, storesOf(row)));
  if (errors.length > 0) return { ok: false, errors };

  const prices = verified.flatMap((row) => {
    const presentation = presentationId(row);
    const date = text(row, 'fecha_consulta');
    // Mediodía en Colombia: la página no dice la hora, solo el día de la consulta.
    const observedAt = new Date(`${date}T12:00:00-05:00`);
    return storesOf(row).map((store) => ({
      id: stableId('initial-price', presentation, storeId(store), date),
      presentationId: presentation,
      establishmentId: storeId(store),
      priceCop: Number(text(row, 'precio')),
      observedAt,
      sourceUrl: text(row, 'url_fuente'),
    }));
  });
  return { ok: true, prices, skipped: priceRows.length - verified.length };
}
