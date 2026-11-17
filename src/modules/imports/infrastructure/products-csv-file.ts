import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE = 'productos.csv';
const BOM = '﻿';
const IMAGE_COLUMNS = ['imagen_url', 'imagen_fuente', 'imagen_atribucion'];

interface Parsed {
  bom: string;
  newline: string;
  header: string[];
  lines: string[];
}

// #119: lee y vuelve a escribir seed/productos.csv tal como lo guarda Excel (separador ;, sin
// comillas, con o sin BOM). Solo cambia las celdas de las filas; las líneas vacías, el BOM y los
// saltos de línea quedan iguales. Si faltan las columnas de imagen, las agrega al final.
export class ProductsCsvFile {
  constructor(private readonly folder: string) {}

  async read(): Promise<Record<string, string>[]> {
    const { header, lines } = await this.parse();
    return lines
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const cells = line.split(';');
        return Object.fromEntries(header.map((column, i) => [column, cells[i] ?? '']));
      });
  }

  async write(rows: Record<string, string>[]): Promise<void> {
    const { bom, newline, header, lines } = await this.parse();
    const columns = [...header, ...IMAGE_COLUMNS.filter((column) => !header.includes(column))];
    const pending = [...rows];
    const body = lines.map((line) => {
      if (line.trim() === '') return line;
      const row = pending.shift() ?? {};
      return columns.map((column) => row[column] ?? '').join(';');
    });
    await writeFile(this.path(), bom + [columns.join(';'), ...body].join(newline), 'utf8');
  }

  private path(): string {
    return join(this.folder, FILE);
  }

  private async parse(): Promise<Parsed> {
    const raw = await readFile(this.path(), 'utf8');
    const bom = raw.startsWith(BOM) ? BOM : '';
    const content = raw.slice(bom.length);
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const [headerLine = '', ...lines] = content.split(newline);
    return { bom, newline, header: headerLine.split(';').map((column) => column.trim()), lines };
  }
}
