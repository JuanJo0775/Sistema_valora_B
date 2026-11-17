import { initialPricesFrom, isChainStore } from './initial-prices';
import { presentationId, storeId } from './seed-ids';
import type { SeedRow } from './seed-source';

const row = (line: number, values: Record<string, string>): SeedRow => ({ line, values });

const rice = row(2, {
  producto: 'Arroz blanco',
  marca: 'Diana',
  categoria: 'grains-groceries',
  cantidad: '500',
  unidad: 'g',
  unidades_empaque: '1',
  verificar: 'no',
  responsable: 'Sara Sanchez',
});

const store = (line: number, osmId: string, nombre: string) =>
  row(line, { osm_id: osmId, nombre, tipo: 'descuento', lat: '4.5', lng: '-75.6', revisar: 'no' });
const d1Centro = store(2, 'node/1', 'D1');
const d1Norte = store(3, 'node/2', 'Tienda D1 - Centro');
const ara = store(4, 'node/3', 'Ara');

const price = (values: Record<string, string> = {}) =>
  row(2, {
    producto: 'Arroz blanco',
    marca: 'Diana',
    cantidad: '500',
    unidad: 'g',
    unidades_empaque: '1',
    cadena: 'D1',
    precio: '1990',
    es_oferta: 'no',
    fecha_consulta: '2026-11-16',
    url_fuente: 'https://www.d1.com.co/arroz-diana-500g-12002073/p',
    coincidencia: 'exacta',
    verificar: 'no',
    responsable: 'Equipo Valora',
    ...values,
  });

describe('precios iniciales de la semilla (B#135)', () => {
  it('un precio de la página de D1 queda en cada tienda D1 de la semilla, con su fuente y su fecha', () => {
    const result = initialPricesFrom([price()], [rice], [d1Centro, d1Norte, ara]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prices.map(({ establishmentId }) => establishmentId)).toEqual([
      storeId(d1Centro),
      storeId(d1Norte),
    ]);
    expect(result.prices[0]).toMatchObject({
      presentationId: presentationId(rice),
      priceCop: 1990,
      sourceUrl: 'https://www.d1.com.co/arroz-diana-500g-12002073/p',
      observedAt: new Date('2026-11-16T12:00:00-05:00'),
    });
  });

  it('repetir la semilla da los mismos ids: no duplica', () => {
    const first = initialPricesFrom([price()], [rice], [d1Centro]);
    const second = initialPricesFrom([price()], [rice], [d1Centro]);

    expect(first.ok && second.ok && first.prices[0]?.id === second.prices[0]?.id).toBe(true);
  });

  it('solo carga las filas que el equipo revisó', () => {
    const result = initialPricesFrom([price({ verificar: 'sí' })], [rice], [d1Centro]);

    expect(result).toEqual({ ok: true, prices: [], skipped: 1 });
  });

  it.each([
    [
      { producto: 'Arroz integral' },
      'el producto «Arroz integral Diana 500 g ×1» no está verificado en productos.csv',
    ],
    [{ cadena: 'Éxito' }, 'ninguna tienda revisada de tiendas.csv es de la cadena «Éxito»'],
    [{ precio: '0' }, 'el precio debe ser un entero mayor que cero, en pesos y sin puntos'],
    [{ precio: '1.990' }, 'el precio debe ser un entero mayor que cero, en pesos y sin puntos'],
    [{ es_oferta: 'sí' }, 'las ofertas no se cargan como precio normal (EC-06, ADR-009)'],
    [{ fecha_consulta: '16/11/2026' }, 'la fecha debe tener el formato AAAA-MM-DD'],
    [{ url_fuente: 'http://www.d1.com.co/p' }, 'la fuente debe ser un enlace https'],
    [{ coincidencia: 'parecida' }, 'la coincidencia debe ser «exacta» o «equivalente»'],
  ])('una fila con %o se rechaza y dice en qué fila está', (change, message) => {
    const result = initialPricesFrom([price(change)], [rice], [d1Centro]);

    expect(result).toEqual({ ok: false, errors: [`precios-iniciales.csv, fila 2: ${message}`] });
  });
});

describe('qué tiendas son de una cadena', () => {
  it.each([
    ['D1', true],
    ['Tienda D1 - Centro', true],
    ['d1 la castellana', true],
    ['Panadería D10', false],
    ['Ara', false],
  ])('«%s» es de D1: %s', (name, expected) => {
    expect(isChainStore(name, 'D1')).toBe(expected);
  });

  it('no distingue tildes ni mayúsculas', () => {
    expect(isChainStore('ÉXITO Express', 'Éxito')).toBe(true);
    expect(isChainStore('Exito Calle 50', 'Éxito')).toBe(true);
  });
});
