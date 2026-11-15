import {
  AlreadyAppealedError,
  AppealReport,
  AppealWindowClosedError,
  InvalidAppealNoteError,
  NotAppealableError,
} from './appeal-report';
import { ReportNotFoundError } from './flag-report';
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

  describe('lo que no se puede apelar', () => {
    it('otra cuenta no encuentra el reporte, para no revelar que existe', async () => {
      const { appeals, appealReport } = setup();

      await expect(
        appealReport.execute({ reportId: 'reporte-1', appellantKey: 'otra', note }),
      ).rejects.toThrow(ReportNotFoundError);
      await expect(
        appealReport.execute({ reportId: 'no-existe', appellantKey: 'autora', note }),
      ).rejects.toThrow(ReportNotFoundError);
      expect(appeals).toEqual([]);
    });

    it.each([
      ['normal', { moderation: undefined }],
      ['aprobado', { moderation: 'aprobado' as const }],
    ])('un reporte %s no se apela', async (_case, change) => {
      const { appeals, appealReport } = setup(observation(change));

      await expect(
        appealReport.execute({ reportId: 'reporte-1', appellantKey: 'autora', note }),
      ).rejects.toThrow(NotAppealableError);
      expect(appeals).toEqual([]);
    });

    it('se apela una sola vez', async () => {
      const { appealReport } = setup();
      await appealReport.execute({ reportId: 'reporte-1', appellantKey: 'autora', note });

      await expect(
        appealReport.execute({ reportId: 'reporte-1', appellantKey: 'autora', note }),
      ).rejects.toThrow(AlreadyAppealedError);
    });

    it('pasados 7 días del descarte ya no se apela', async () => {
      const { appeals, appealReport } = setup(observation(), new Date('2026-11-21T14:00:01Z'));

      await expect(
        appealReport.execute({ reportId: 'reporte-1', appellantKey: 'autora', note }),
      ).rejects.toThrow(AppealWindowClosedError);
      expect(appeals).toEqual([]);
    });

    it.each(['', '   ', 'Corto'])(
      'sin un motivo de 10 caracteres ("%s") no se apela',
      async (short) => {
        const { appeals, appealReport } = setup();

        await expect(
          appealReport.execute({ reportId: 'reporte-1', appellantKey: 'autora', note: short }),
        ).rejects.toThrow(InvalidAppealNoteError);
        expect(appeals).toEqual([]);
      },
    );
  });
});
