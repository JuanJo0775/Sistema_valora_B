import { AccuracySample } from './accuracy-sample';
import type { SeedRow } from './seed-source';
import { stableId } from './stable-id';

// Fila de muestra-exactitud.csv tal como la deja el equipo; la línea 1 es el encabezado.
const sampleRow = (line: number, values: Partial<Record<string, string>> = {}): SeedRow => ({
  line,
  values: {
    osm_id: 'node/1',
    producto: 'Arroz de prueba',
    marca: 'Marca de prueba',
    cantidad: '500',
    unidad: 'g',
    unidades_empaque: '1',
    precio: '2500',
    fecha: '2026-11-14',
    responsable: 'Integrante de prueba',
    ...values,
  },
});
const read = (rows: SeedRow[]) =>
  new AccuracySample({ readSample: () => Promise.resolve(rows) }).read();

// PR-22 (#93): la muestra usa los mismos ids fijos de la semilla para encontrar tienda y presentación.
describe('muestra de exactitud (PR-22, #93)', () => {
  it('cada fila trae la tienda y la presentación de la semilla, el precio y el día visto', async () => {
    const productId = stableId('product', 'arroz de prueba', 'marca de prueba');

    await expect(read([sampleRow(2)])).resolves.toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          establishmentId: stableId('establishment', 'node/1'),
          presentationId: stableId('presentation', productId, '500', 'g', '1'),
          label: 'Arroz de prueba Marca de prueba 500 g',
          storeOsmId: 'node/1',
          priceCop: 2500,
          // Mediodía en Colombia del día anotado.
          observedAt: new Date('2026-11-14T17:00:00Z'),
          responsible: 'Integrante de prueba',
        },
      ],
    });
  });

  it.each([
    [
      'un precio que no es un entero mayor que 0',
      { precio: '2.500,5' },
      'el precio debe ser un entero mayor que 0',
    ],
    ['una fecha inválida', { fecha: '14/11/2026' }, 'la fecha debe tener el formato AAAA-MM-DD'],
    ['sin responsable', { responsable: '' }, 'falta el responsable'],
    ['sin tienda', { osm_id: '' }, 'falta el osm_id de la tienda'],
  ])('rechaza %s nombrando la fila', async (_case, change, message) => {
    await expect(read([sampleRow(2), sampleRow(3, change)])).resolves.toEqual({
      ok: false,
      errors: [`muestra-exactitud.csv, fila 3: ${message}`],
    });
  });
});
