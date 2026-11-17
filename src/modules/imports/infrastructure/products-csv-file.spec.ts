import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductsCsvFile } from './products-csv-file';

describe('productos.csv para las fotos (#119)', () => {
  let folder: string;
  const file = () => join(folder, 'productos.csv');

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'valora-images-'));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('agrega las columnas de imagen al final y deja igual el resto del archivo', async () => {
    writeFileSync(
      file(),
      '﻿producto;marca;codigo_barras\r\nArroz;Diana;7702001023456\r\n\r\nPanela;;\r\n',
    );
    const csv = new ProductsCsvFile(folder);

    const rows = await csv.read();
    expect(rows).toEqual([
      { producto: 'Arroz', marca: 'Diana', codigo_barras: '7702001023456' },
      { producto: 'Panela', marca: '', codigo_barras: '' },
    ]);

    await csv.write([
      {
        ...rows[0],
        imagen_url: 'https://images.openfoodfacts.org/a.jpg',
        imagen_fuente: 'open_food_facts',
        imagen_atribucion: 'Open Food Facts, CC BY-SA',
      },
      rows[1] ?? {},
    ]);

    expect(readFileSync(file(), 'utf8')).toBe(
      '﻿producto;marca;codigo_barras;imagen_url;imagen_fuente;imagen_atribucion\r\n' +
        'Arroz;Diana;7702001023456;https://images.openfoodfacts.org/a.jpg;open_food_facts;Open Food Facts, CC BY-SA\r\n' +
        '\r\n' +
        'Panela;;;;;\r\n',
    );
  });

  it('si las columnas ya están, las llena en su lugar', async () => {
    writeFileSync(
      file(),
      'producto;imagen_url;imagen_fuente;imagen_atribucion;fecha\nSal;;;;2026-11-15\n',
    );
    const csv = new ProductsCsvFile(folder);
    const [salt = {}] = await csv.read();

    await csv.write([
      { ...salt, imagen_url: 'https://x.org/s.jpg', imagen_fuente: 'open_food_facts' },
    ]);

    expect(readFileSync(file(), 'utf8')).toBe(
      'producto;imagen_url;imagen_fuente;imagen_atribucion;fecha\nSal;https://x.org/s.jpg;open_food_facts;;2026-11-15\n',
    );
  });
});
