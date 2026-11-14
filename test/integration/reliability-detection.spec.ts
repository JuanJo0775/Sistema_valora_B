import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  AssessReportedPrice,
  type PriceReportedV2,
} from '../../src/modules/reliability/application/assess-reported-price';
import {
  DrizzleObservationStore,
  DrizzleReputationStore,
} from '../../src/modules/reliability/infrastructure/drizzle-stores';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';
import type { DomainEvent } from '../../src/shared/events';

// Conjunto etiquetado de la #67 (PR-11): 100 reportes en orden de llegada, 30 anómalos.
interface LabeledReport extends PriceReportedV2 {
  anomalo: 'si' | 'no';
  tipo: string;
}

const fixtures = join(__dirname, '..', 'fixtures', 'reliability');

function readLabeledReports(): LabeledReport[] {
  const [header = '', ...lines] = readFileSync(join(fixtures, 'labeled-reports.csv'), 'utf8')
    .trim()
    .split(/\r?\n/);
  const columns = header.split(';');
  return lines.map((line) => {
    const values = line.split(';');
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
    return { ...row, priceCop: Number(row['priceCop']) } as unknown as LabeledReport;
  });
}

// Zonas del conjunto (ver README.md): S1, S2 y S3 están a menos de 1 km entre sí; S4 y S5 también;
// S6 no tiene vecinas.
const store = (n: number) => `67000000-0000-4000-8000-1000000000${String(n).padStart(2, '0')}`;
const zones = [[store(1), store(2), store(3)], [store(4), store(5)], [store(6)]];
// Huevos y leche son de categorías frescas (TTL de 7 días); arroz y aceite, no (14 días).
const freshPresentations = new Set([
  '67000000-0000-4000-8000-000000000003',
  '67000000-0000-4000-8000-000000000004',
]);

interface Outcome {
  report: LabeledReport;
  verdict: string;
}

describe('detección de anómalos con el conjunto etiquetado (PR-11, EC-03)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  const outcomes: Outcome[] = [];

  beforeAll(async () => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    await db.execute(
      sql`truncate reliability.observations, reliability.reputations, reliability.reputation_events`,
    );

    // El caso de uso real de reliability con sus repositorios reales; solo la zona y la frescura,
    // que son de otros módulos, vienen del conjunto.
    const published: DomainEvent[] = [];
    const assess = new AssessReportedPrice({
      observations: new DrizzleObservationStore(db),
      reputations: new DrizzleReputationStore(db),
      zone: {
        around: (establishmentId) =>
          Promise.resolve(
            zones.find((zone) => zone.includes(establishmentId)) ?? [establishmentId],
          ),
      },
      freshness: {
        isFresh: (presentationId) => Promise.resolve(freshPresentations.has(presentationId)),
      },
      events: {
        publish: (event) => {
          published.push(event);
          return Promise.resolve();
        },
      },
    });

    for (const report of readLabeledReports()) {
      await assess.execute(report);
      const verdict = String(published.at(-1)?.payload['verdict']);
      outcomes.push({ report, verdict });
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('el conjunto tiene 100 reportes y 30 anómalos', () => {
    expect(outcomes).toHaveLength(100);
    expect(outcomes.filter(({ report }) => report.anomalo === 'si')).toHaveLength(30);
  });

  it('detecta el 80 % o más de los anómalos (solo «sospechoso» cuenta como detectado)', () => {
    const anomalies = outcomes.filter(({ report }) => report.anomalo === 'si');
    const detected = anomalies.filter(({ verdict }) => verdict === 'sospechoso');

    if (process.env['PRINT_DETECTION_REPORT'] === '1') {
      process.stdout.write(detectionReport(outcomes));
    }
    expect(detected.length / anomalies.length).toBeGreaterThanOrEqual(0.8);
  });
});

// Tabla de resultados para docs/calidad/deteccion-anomalos.md (pnpm reliability:evaluate).
function detectionReport(outcomes: Outcome[]): string {
  const types = [...new Set(outcomes.map(({ report }) => report.tipo))];
  const rows = types.map((type) => {
    const ofType = outcomes.filter(({ report }) => report.tipo === type);
    const count = (verdict: string) =>
      ofType.filter((outcome) => outcome.verdict === verdict).length;
    return `| ${type} | ${ofType[0]?.report.anomalo ?? ''} | ${String(ofType.length)} | ${String(count('sospechoso'))} | ${String(count('normal'))} | ${String(count('sin_datos'))} |`;
  });
  const anomalies = outcomes.filter(({ report }) => report.anomalo === 'si');
  const honest = outcomes.filter(({ report }) => report.anomalo === 'no');
  const detected = anomalies.filter(({ verdict }) => verdict === 'sospechoso').length;
  const falsePositives = honest.filter(({ verdict }) => verdict === 'sospechoso').length;
  return [
    '',
    '| Tipo | Anómalo | Reportes | Sospechoso | Normal | Sin datos |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    `Detección: ${String(detected)} de ${String(anomalies.length)} (${String(Math.round((detected / anomalies.length) * 100))} %).`,
    `Falsos positivos: ${String(falsePositives)} de ${String(honest.length)} honestos (${String(Math.round((falsePositives / honest.length) * 100))} %).`,
    '',
  ].join('\n');
}
