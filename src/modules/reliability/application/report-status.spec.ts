import type { AnomalyResult } from '../../../domain/anomaly';
import { ReportNotFoundError } from './flag-report';
import { ReportStatus } from './report-status';
import type { AppealRecord, LogEntry, Observation } from './stores';

const discardedAt = new Date('2026-11-14T14:00:00Z');
const normal: AnomalyResult = { status: 'normal', median: 2000, deviation: 0, references: 3 };
const suspicious: AnomalyResult = {
  status: 'sospechoso',
  reason: 'rango',
  median: 4000,
  deviation: 0.5,
  references: 3,
};

const observation = (change: Partial<Observation> = {}): Observation => ({
  reportId: 'reporte-1',
  presentationId: 'arroz-500g',
  establishmentId: 'don-jose',
  reporterKey: 'autora',
  reporterSince: new Date('2025-01-01'),
  priceCop: 2000,
  priceType: 'normal',
  observedAt: discardedAt,
  receivedAt: discardedAt,
  verdict: normal,
  ...change,
});

const discard: LogEntry = {
  reportId: 'reporte-1',
  decision: 'descartar',
  note: 'Precio imposible para esta tienda',
  moderatorKey: 'moderadora',
  decidedAt: discardedAt,
  stage: 'revision',
};

interface Stored {
  observation: Observation;
  flagged?: boolean;
  revision?: LogEntry;
  appeal?: AppealRecord;
}

function statusOf(stored: Stored, now = new Date('2026-11-15T14:00:00Z')) {
  return new ReportStatus({
    observations: {
      byReportId: (id) => Promise.resolve(id === 'reporte-1' ? stored.observation : null),
    },
    moderation: {
      pending: () =>
        Promise.resolve(
          stored.flagged || stored.observation.verdict.status === 'sospechoso'
            ? [{ observation: stored.observation, flags: stored.flagged ? 1 : 0 }]
            : [],
        ),
      revisionOf: () => Promise.resolve(stored.revision ?? null),
      appealOf: () => Promise.resolve(stored.appeal ?? null),
    },
    clock: { now: () => now },
  });
}

const appeal = (outcome: AppealRecord['outcome']): AppealRecord => ({
  note: 'El precio sí era ese',
  createdAt: discardedAt,
  outcome,
});

describe('estado de un reporte para su autor (grill de la #71, pregunta 1)', () => {
  it.each<[string, Stored, string]>([
    ['un precio que nadie revisa', { observation: observation() }, 'normal'],
    [
      'un sospechoso sin decisión',
      { observation: observation({ verdict: suspicious }) },
      'en_revision',
    ],
    ['un precio marcado como dudoso', { observation: observation(), flagged: true }, 'en_revision'],
    [
      'uno aprobado por un moderador',
      { observation: observation({ moderation: 'aprobado' }) },
      'normal',
    ],
    [
      'uno con la apelación pendiente',
      {
        observation: observation({ moderation: 'descartado' }),
        revision: discard,
        appeal: appeal(null),
      },
      'apelacion_pendiente',
    ],
    [
      'uno con la apelación aceptada',
      {
        observation: observation({ moderation: 'aprobado' }),
        revision: discard,
        appeal: appeal('aceptada'),
      },
      'apelacion_aceptada',
    ],
    [
      'uno con la apelación rechazada',
      {
        observation: observation({ moderation: 'descartado' }),
        revision: discard,
        appeal: appeal('rechazada'),
      },
      'apelacion_rechazada',
    ],
  ])('%s: %s', async (_case, stored, status) => {
    await expect(statusOf(stored).of('reporte-1', 'autora')).resolves.toEqual({
      reportId: 'reporte-1',
      status,
    });
  });

  it('un reporte descartado dice hasta cuándo se puede apelar', async () => {
    const stored = { observation: observation({ moderation: 'descartado' }), revision: discard };

    await expect(statusOf(stored).of('reporte-1', 'autora')).resolves.toEqual({
      reportId: 'reporte-1',
      status: 'descartado',
      appealableUntil: new Date('2026-11-21T14:00:00Z'),
    });
  });

  it('pasado el plazo, el descartado ya no dice hasta cuándo', async () => {
    const stored = { observation: observation({ moderation: 'descartado' }), revision: discard };

    await expect(
      statusOf(stored, new Date('2026-11-22T14:00:00Z')).of('reporte-1', 'autora'),
    ).resolves.toEqual({ reportId: 'reporte-1', status: 'descartado' });
  });

  it('otra cuenta no encuentra el reporte, ni uno que no existe', async () => {
    const status = statusOf({ observation: observation() });

    await expect(status.of('reporte-1', 'otra')).rejects.toThrow(ReportNotFoundError);
    await expect(status.of('no-existe', 'autora')).rejects.toThrow(ReportNotFoundError);
  });
});
