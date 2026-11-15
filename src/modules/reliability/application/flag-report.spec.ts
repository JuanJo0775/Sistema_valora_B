import { FlagReport } from './flag-report';
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

  flag(flag: NewFlag): Promise<boolean> {
    this.flags.push(flag);
    return Promise.resolve(true);
  }

  pending(): Promise<PendingItem[]> {
    return Promise.resolve([]);
  }

  decide(): Promise<void> {
    return Promise.resolve();
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
});
