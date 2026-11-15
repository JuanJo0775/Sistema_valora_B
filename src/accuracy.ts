import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { type Accuracy, accuracyOf, accuracySummary } from './domain/price-accuracy';
import { ComparisonModule, CurrentPriceOf } from './modules/comparison';
import { AccuracySample, ImportsModule } from './modules/imports';
import { validateEnv } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { EventsModule } from './shared/events';

const REPORT_FILE = 'docs/calidad/exactitud-pr22.md';
// Colombia está en UTC-5 todo el año (no cambia de hora).
const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
const number = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

const colombiaDate = (instant: Date): string =>
  new Date(instant.getTime() + COLOMBIA_OFFSET_MS).toISOString().slice(0, 10);
const signed = (value: number): string => (value > 0 ? '+' : value < 0 ? '−' : '');
const money = (value: number): string => `$${number.format(Math.abs(value))}`;

function differenceCells(result: Accuracy): string {
  if (result.status === 'sin_precio') return '— | —';
  const sign = signed(result.diffCop);
  return `${sign}${money(result.diffCop)} (${sign}${number.format(Math.abs(result.diffPct))} %) | ${String(result.daysApart)}`;
}

export type AccuracyReport = { ok: true; markdown: string } | { ok: false; errors: string[] };

// PR-22 (#93): une la muestra del equipo con lo que Valora publica y arma el informe. La cuenta la
// hace el dominio (price-accuracy); aquí solo se escribe la tabla.
export async function accuracyReport(
  sample: Pick<AccuracySample, 'read'>,
  prices: Pick<CurrentPriceOf, 'find'>,
  now: Date,
): Promise<AccuracyReport> {
  const read = await sample.read();
  if (!read.ok) return read;
  const lines: string[] = [];
  const results: Accuracy[] = [];
  for (const row of read.rows) {
    const published = await prices.find(row.presentationId, row.establishmentId);
    const result = accuracyOf(row, published);
    results.push(result);
    const shown = published
      ? `${money(published.priceCop)} (${colombiaDate(published.observedAt)}, ${published.status})`
      : 'Sin precio en Valora';
    lines.push(
      `| ${String(row.line)} | ${row.storeOsmId} | ${row.label} | ${money(row.priceCop)} (${colombiaDate(row.observedAt)}) | ${shown} | ${differenceCells(result)} | ${row.responsible} |`,
    );
  }
  const summary = accuracySummary(results);
  const median =
    summary.medianAbsDiffPct === null ? '—' : `${number.format(summary.medianAbsDiffPct)} %`;
  const markdown = [
    '# PR-22 — Exactitud de los precios publicados',
    '',
    `Generado el ${colombiaDate(now)} con \`pnpm quality:accuracy\` (issue #93). Compara los precios que el equipo vio en la tienda (\`seed/muestra-exactitud.csv\`) con el precio vigente que Valora publica para esa presentación en esa tienda. La diferencia es publicado menos observado, sobre el observado. MC-E2: se registran las diferencias, sin porcentaje mínimo.`,
    '',
    '## Resumen',
    '',
    '| Filas | Comparadas | Coinciden | Sin precio en Valora | Mediana de la diferencia |',
    '| --- | --- | --- | --- | --- |',
    `| ${String(summary.rows)} | ${String(summary.compared)} | ${String(summary.matching)} | ${String(summary.withoutPrice)} | ${median} |`,
    '',
    '## Detalle',
    '',
    '| Fila | Tienda (osm_id) | Presentación | Observado en tienda | Publicado en Valora | Diferencia | Días entre observaciones | Responsable |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...lines,
    '',
  ].join('\n');
  return { ok: true, markdown };
}

// pnpm quality:accuracy: el mismo arranque que usa la prueba.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    EventsModule,
    ImportsModule,
    ComparisonModule,
  ],
})
export class AccuracyModule {}

async function main(): Promise<void> {
  const logger = new Logger('Exactitud');
  const context = await NestFactory.createApplicationContext(AccuracyModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const report = await accuracyReport(
      context.get(AccuracySample),
      context.get(CurrentPriceOf),
      new Date(),
    );
    if (!report.ok) {
      for (const error of report.errors) logger.error(error);
      process.exitCode = 1;
      return;
    }
    await writeFile(REPORT_FILE, report.markdown, 'utf8');
    logger.log(`Informe escrito en ${REPORT_FILE}.`);
  } finally {
    await context.close();
  }
}

// Solo al ejecutarlo como comando; las pruebas importan accuracyReport y AccuracyModule.
if (require.main === module) void main();
