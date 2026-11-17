import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CsvSeedSource } from './csv-seed-source';

describe('lector de los CSV de la semilla', () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'valora-seed-'));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('entiende el archivo que guarda Excel: BOM, separador ; y columnas por nombre', async () => {
    writeFileSync(
      join(folder, 'tiendas.csv'),
      '\uFEFFosm_id;nombre;tipo\r\nnode/1;Tienda de prueba; barrio \r\n\r\nnode/2;Otra tienda;minimercado\r\n',
    );
    writeFileSync(join(folder, 'productos.csv'), 'producto;marca\n');

    const source = new CsvSeedSource(folder);

    await expect(source.readStores()).resolves.toEqual([
      { line: 2, values: { osm_id: 'node/1', nombre: 'Tienda de prueba', tipo: ' barrio ' } },
      { line: 4, values: { osm_id: 'node/2', nombre: 'Otra tienda', tipo: 'minimercado' } },
    ]);
    await expect(source.readProducts()).resolves.toEqual([]);
  });

  // Grill de la #34: sipsa.csv es opcional; sin el archivo no hay referencias.
  it('lee las referencias de sipsa.csv y, si el archivo no está, no hay ninguna', async () => {
    const source = new CsvSeedSource(folder);
    await expect(source.readReferences()).resolves.toEqual([]);

    writeFileSync(join(folder, 'sipsa.csv'), 'producto;precio_kg\nArroz;3200\n');

    await expect(source.readReferences()).resolves.toEqual([
      { line: 2, values: { producto: 'Arroz', precio_kg: '3200' } },
    ]);
  });

  // B#135: precios-iniciales.csv también es opcional; sin el archivo no hay datos iniciales.
  it('lee los precios iniciales de precios-iniciales.csv y, si el archivo no está, no hay ninguno', async () => {
    const source = new CsvSeedSource(folder);
    await expect(source.readInitialPrices()).resolves.toEqual([]);

    writeFileSync(join(folder, 'precios-iniciales.csv'), 'cadena;precio\nD1;1990\n');

    await expect(source.readInitialPrices()).resolves.toEqual([
      { line: 2, values: { cadena: 'D1', precio: '1990' } },
    ]);
  });
});
