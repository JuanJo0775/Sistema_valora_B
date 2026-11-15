import { at, isValidDate, text } from './seed-rows';
import { presentationId, storeId } from './seed-ids';
import type { SeedRow } from './seed-source';

export const SAMPLE_FILE = 'muestra-exactitud.csv';

// Precio que el equipo vio en una tienda (PR-22), con los ids fijos de la semilla.
export interface SampleRow {
  line: number;
  establishmentId: string;
  presentationId: string;
  label: string;
  storeOsmId: string;
  priceCop: number;
  observedAt: Date;
  responsible: string;
}

export type SampleResult = { ok: true; rows: SampleRow[] } | { ok: false; errors: string[] };

// PR-22 (#93): lee la muestra de precios observados; si una fila no es válida, no se usa ninguna.
export class AccuracySample {
  constructor(private readonly source: { readSample(): Promise<SeedRow[]> }) {}

  async read(): Promise<SampleResult> {
    const rows = await this.source.readSample();
    const errors = rows.flatMap(rowErrors);
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, rows: rows.map(toSampleRow) };
  }
}

function rowErrors(row: SeedRow): string[] {
  const errors: string[] = [];
  if (text(row, 'osm_id') === '') errors.push(at(SAMPLE_FILE, row, 'falta el osm_id de la tienda'));
  const price = Number(text(row, 'precio'));
  if (!Number.isInteger(price) || price < 1) {
    errors.push(at(SAMPLE_FILE, row, 'el precio debe ser un entero mayor que 0'));
  }
  if (!isValidDate(text(row, 'fecha'))) {
    errors.push(at(SAMPLE_FILE, row, 'la fecha debe tener el formato AAAA-MM-DD'));
  }
  if (text(row, 'responsable') === '') errors.push(at(SAMPLE_FILE, row, 'falta el responsable'));
  return errors;
}

function toSampleRow(row: SeedRow): SampleRow {
  const label = [
    text(row, 'producto'),
    text(row, 'marca'),
    text(row, 'cantidad'),
    text(row, 'unidad'),
  ]
    .filter((part) => part !== '')
    .join(' ');
  return {
    line: row.line,
    establishmentId: storeId(row),
    presentationId: presentationId(row),
    label,
    storeOsmId: text(row, 'osm_id'),
    priceCop: Number(text(row, 'precio')),
    // Mediodía en Colombia (UTC-5) del día anotado: el CSV solo trae la fecha.
    observedAt: new Date(`${text(row, 'fecha')}T12:00:00-05:00`),
    responsible: text(row, 'responsable'),
  };
}
