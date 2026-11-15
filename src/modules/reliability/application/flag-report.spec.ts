import { AlreadyFlaggedError, FlagReport, ReportNotFoundError } from './flag-report';
import type { ModerationStore, NewFlag, Observation, PendingItem } from './stores';

const now = new Date('2026-11-14T14:00:00Z');

const observation = (reportId: string): Observation => ({
  reportId,
  presentationId: 'arroz-500g',
  establishmentId: 'tienda-centro',
  reporterKey: 'autor',
  reporterSince: new Date('2025-01-01'),
  priceCop: 2500,
  priceType: 'normal',
  observedAt: now,
  receivedAt: now,
  verdict: { status: 'sin_datos', references: 0 },
});

class InMemoryModeration implements ModerationStore {
  readonly flags: NewFlag[] = [];

  // Igual que la llave (report_id, flagger_key) de la tabla flags.
  flag(flag: NewFlag): Promise<boolean> {
    const repeated = this.flags.some(
      (seen) => seen.reportId === flag.reportId && seen.flaggerKey === flag.flaggerKey,
    );
    if (!repeated) this.flags.push(flag);
    return Promise.resolve(!repeated);
  }

  pending(): Promise<PendingItem[]> {
    return Promise.resolve([]);
  }

  decide(): Promise<void> {
    return Promise.resolve();
  }

  decisionsAbout(): Promise<[]> {
    return Promise.resolve([]);
  }

  appeal(): Promise<boolean> {
    return Promise.reject(new Error('FlagReport no apela'));
  }

  appealOf(): Promise<null> {
    return Promise.resolve(null);
  }

  revisionOf(): Promise<null> {
    return Promise.resolve(null);
  }
}

function setup(known: Observation[] = [observation('reporte-1')]) {
  const moderation = new InMemoryModeration();
  const flagReport = new FlagReport({
    moderation,
    observations: {
      byReportId: (reportId) =>
        Promise.resolve(known.find((seen) => seen.reportId === reportId) ?? null),
    },
    clock: { now: () => now },
  });
  return { moderation, flagReport };
}

describe('marcar un reporte como dudoso (RF-013)', () => {
  it('una cuenta marca un reporte y queda registrada con su motivo', async () => {
    const { moderation, flagReport } = setup();

    await flagReport.execute({
      reportId: 'reporte-1',
      flaggerKey: 'vecina',
      reason: 'precio_falso',
      comment: 'En la tienda está a $4.000',
    });

    expect(moderation.flags).toEqual([
      {
        reportId: 'reporte-1',
        flaggerKey: 'vecina',
        reason: 'precio_falso',
        comment: 'En la tienda está a $4.000',
        createdAt: now,
      },
    ]);
  });

  it('la misma cuenta no puede marcar dos veces el mismo reporte; otra cuenta sí', async () => {
    const { moderation, flagReport } = setup();
    await flagReport.execute({ reportId: 'reporte-1', flaggerKey: 'vecina', reason: 'otro' });

    await expect(
      flagReport.execute({ reportId: 'reporte-1', flaggerKey: 'vecina', reason: 'precio_falso' }),
    ).rejects.toThrow(AlreadyFlaggedError);
    await flagReport.execute({ reportId: 'reporte-1', flaggerKey: 'otra', reason: 'otro' });
    expect(moderation.flags.map((flag) => flag.flaggerKey)).toEqual(['vecina', 'otra']);
  });

  it('un reporte que no existe no se puede marcar', async () => {
    const { moderation, flagReport } = setup();

    await expect(
      flagReport.execute({ reportId: 'no-existe', flaggerKey: 'vecina', reason: 'otro' }),
    ).rejects.toThrow(ReportNotFoundError);
    expect(moderation.flags).toEqual([]);
  });
});
