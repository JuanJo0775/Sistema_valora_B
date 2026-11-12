import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SeedRow, SeedSource } from '../application/seed-source';

// Lee seed/productos.csv y seed/tiendas.csv tal como los guarda Excel (grill de la #51, pregunta 1):
// separador ;, sin comillas, con o sin BOM. Las líneas vacías se saltan, pero cuentan para el número de fila.
export class CsvSeedSource implements SeedSource {
  constructor(private readonly folder: string) {}

  readProducts(): Promise<SeedRow[]> {
    return this.read('productos.csv');
  }

  readStores(): Promise<SeedRow[]> {
    return this.read('tiendas.csv');
  }

  private async read(file: string): Promise<SeedRow[]> {
    const content = (await readFile(join(this.folder, file), 'utf8')).replace(/^\uFEFF/, '');
    const [headerLine = '', ...lines] = content.split(/\r?\n/);
    const header = headerLine.split(';').map((column) => column.trim());
    const rows: SeedRow[] = [];
    lines.forEach((line, index) => {
      if (line.trim() === '') return;
      const cells = line.split(';');
      rows.push({
        line: index + 2,
        values: Object.fromEntries(header.map((column, i) => [column, cells[i] ?? ''])),
      });
    });
    return rows;
  }
}
