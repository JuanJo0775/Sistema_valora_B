import type { DomainEvent } from '../../../shared/events';
import { AlreadyFlaggedError, FlagReport, PRICE_FLAGGED, ReportNotFoundError } from './flag-report';
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

  authoredBy(): Promise<[]> {
    return Promise.resolve([]);
  }

  markBurst(): Promise<void> {
    return Promise.resolve();
  }
}

function setup(known: Observation[] = [observation('reporte-1')]) {
  const moderation = new InMemoryModeration();
  const published: DomainEvent[] = [];
  const flagReport = new FlagReport({
    moderation,
    observations: {
      byReportId: (reportId) =>
        Promise.resolve(known.find((seen) => seen.reportId === reportId) ?? null),
    },
    events: {
      publish: (event) => {
        published.push(event);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { moderation, flagReport, published };
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
  // EC-03: un reporte marcado deja de ser el precio titular mientras un moderador lo revisa.
  describe('aviso a comparison (PriceFlagged)', () => {
    it('al marcar un reporte sin decisión avisa su presentación y tienda, sin la cuenta', async () => {
      const { flagReport, published } = setup();

      await flagReport.execute({ reportId: 'reporte-1', flaggerKey: 'vecina', reason: 'otro' });

      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({
        type: PRICE_FLAGGED,
        version: 1,
        payload: {
          reportId: 'reporte-1',
          presentationId: 'arroz-500g',
          establishmentId: 'tienda-centro',
        },
      });
      expect(JSON.stringify(published[0])).not.toContain('vecina');
      expect(JSON.stringify(published[0])).not.toContain('autor');
    });

    it('no avisa si la cuenta ya lo había marcado', async () => {
      const { flagReport, published } = setup();
      await flagReport.execute({ reportId: 'reporte-1', flaggerKey: 'vecina', reason: 'otro' });

      await expect(
        flagReport.execute({ reportId: 'reporte-1', flaggerKey: 'vecina', reason: 'otro' }),
      ).rejects.toThrow(AlreadyFlaggedError);

      expect(published).toHaveLength(1);
    });

    it('no avisa si el moderador ya decidió: no volvería a la cola', async () => {
      const decided: Observation = { ...observation('reporte-1'), moderation: 'aprobado' };
      const { flagReport, published } = setup([decided]);

      await flagReport.execute({ reportId: 'reporte-1', flaggerKey: 'vecina', reason: 'otro' });

      expect(published).toEqual([]);
    });
  });
});
