import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INITIAL_PRICES_FILE } from '../application/initial-prices';
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

  // Grill de la #34: sipsa.csv es opcional.
  readReferences(): Promise<SeedRow[]> {
    return this.readOptional('sipsa.csv');
  }

  // PR-22 (#93): la muestra de exactitud también es opcional.
  readSample(): Promise<SeedRow[]> {
    return this.readOptional('muestra-exactitud.csv');
  }

  // B#135: los precios iniciales también son opcionales.
  readInitialPrices(): Promise<SeedRow[]> {
    return this.readOptional(INITIAL_PRICES_FILE);
  }

  private async readOptional(file: string): Promise<SeedRow[]> {
    try {
      await access(join(this.folder, file));
    } catch {
      return [];
    }
    return this.read(file);
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
