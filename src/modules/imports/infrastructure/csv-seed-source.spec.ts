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
      '﻿osm_id;nombre;tipo\r\nnode/1;Tienda de prueba; barrio \r\n\r\nnode/2;Otra tienda;minimercado\r\n',
    );
    writeFileSync(join(folder, 'productos.csv'), 'producto;marca\n');

    const source = new CsvSeedSource(folder);

    await expect(source.readStores()).resolves.toEqual([
      { line: 2, values: { osm_id: 'node/1', nombre: 'Tienda de prueba', tipo: ' barrio ' } },
      { line: 4, values: { osm_id: 'node/2', nombre: 'Otra tienda', tipo: 'minimercado' } },
    ]);
    await expect(source.readProducts()).resolves.toEqual([]);
  });
});
