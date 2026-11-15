import { AppealReport } from './appeal-report';
import type { LogEntry, NewAppeal, Observation } from './stores';

const discardedAt = new Date('2026-11-14T14:00:00Z');
const now = new Date('2026-11-15T14:00:00Z');
const note = 'El precio sí era ese; está en la etiqueta';

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
  verdict: { status: 'sospechoso', reason: 'rango', median: 4000, deviation: 0.5, references: 3 },
  moderation: 'descartado',
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

function setup(stored: Observation = observation(), clock = now) {
  const appeals: NewAppeal[] = [];
  const appealReport = new AppealReport({
    observations: {
      byReportId: (reportId) => Promise.resolve(reportId === stored.reportId ? stored : null),
    },
    moderation: {
      revisionOf: (reportId) => Promise.resolve(reportId === discard.reportId ? discard : null),
      appeal: (appeal) => {
        const repeated = appeals.some((seen) => seen.reportId === appeal.reportId);
        if (!repeated) appeals.push(appeal);
        return Promise.resolve(!repeated);
      },
    },
    clock: { now: () => clock },
  });
  return { appeals, appealReport };
}

describe('apelar un reporte descartado (RF-013 RN4)', () => {
  it('la autora apela su reporte descartado con un motivo', async () => {
    const { appeals, appealReport } = setup();

    await appealReport.execute({ reportId: 'reporte-1', appellantKey: 'autora', note });

    expect(appeals).toEqual([{ reportId: 'reporte-1', note, createdAt: now }]);
  });
});
