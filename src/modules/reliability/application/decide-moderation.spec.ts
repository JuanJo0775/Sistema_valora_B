import type { AnomalyResult } from '../../../domain/anomaly';
import type { DomainEvent } from '../../../shared/events';
import { DecideModeration, InvalidNoteError, ReportNotInQueueError } from './decide-moderation';
import type {
  LogEntry,
  ModerationStore,
  NewFlag,
  Observation,
  ObservationStore,
  PendingItem,
  ReputationStore,
} from './stores';

const now = new Date('2026-11-14T14:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const note = 'El precio coincide con la foto de la góndola';

let sequence = 0;
// Reporte de prueba del arroz de 500 g en la tienda de don José.
const observation = (change: Partial<Observation> = {}): Observation => {
  sequence += 1;
  return {
    reportId: `reporte-${String(sequence)}`,
    presentationId: 'arroz-500g',
    establishmentId: 'don-jose',
    reporterKey: `autor-${String(sequence)}`,
    reporterSince: new Date('2025-01-01'),
    priceCop: 4000,
    priceType: 'normal',
    observedAt: hoursAgo(2),
    receivedAt: hoursAgo(2),
    verdict: { status: 'normal', median: 4000, deviation: 0, references: 3 },
    ...change,
  };
};

const suspicious: AnomalyResult = {
  status: 'sospechoso',
  reason: 'rango',
  median: 4000,
  deviation: 0.5,
  references: 3,
};

class InMemoryObservations implements ObservationStore {
  constructor(readonly saved: Observation[]) {}

  forPresentation(presentationId: string, establishmentIds: string[]): Promise<Observation[]> {
    return Promise.resolve(
      this.saved.filter(
        (seen) =>
          seen.presentationId === presentationId && establishmentIds.includes(seen.establishmentId),
      ),
    );
  }

  byReportId(reportId: string): Promise<Observation | null> {
    return Promise.resolve(this.saved.find((seen) => seen.reportId === reportId) ?? null);
  }

  save(): Promise<void> {
    return Promise.reject(new Error('DecideModeration no guarda observaciones'));
  }
}

// Como DrizzleModerationStore: la decisión cambia el estado de la observación.
class InMemoryModeration implements ModerationStore {
  readonly log: LogEntry[] = [];
  readonly flags: NewFlag[] = [];

  constructor(private readonly observations: InMemoryObservations) {}

  flag(flag: NewFlag): Promise<boolean> {
    this.flags.push(flag);
    return Promise.resolve(true);
  }

  pending(): Promise<PendingItem[]> {
    return Promise.resolve(
      this.observations.saved
        .map((seen) => ({
          observation: seen,
          flags: this.flags.filter((flag) => flag.reportId === seen.reportId).length,
        }))
        .filter(
          (item) =>
            item.observation.moderation === undefined &&
            (item.observation.verdict.status === 'sospechoso' || item.flags > 0),
        ),
    );
  }

  decide(entry: LogEntry): Promise<void> {
    this.log.push(entry);
    const seen = this.observations.saved.find((saved) => saved.reportId === entry.reportId);
    if (seen && entry.decision !== 'observar_cuentas') {
      seen.moderation = entry.decision === 'aprobar' ? 'aprobado' : 'descartado';
    }
    return Promise.resolve();
  }
}

class InMemoryReputations implements ReputationStore {
  readonly values = new Map<string, number>();

  valuesOf(keys: string[]): Promise<Map<string, number>> {
    return Promise.resolve(
      new Map(
        keys.flatMap((key) => (this.values.has(key) ? [[key, this.values.get(key) ?? 0]] : [])),
      ),
    );
  }

  claimPoint(): Promise<boolean> {
    return Promise.reject(new Error('DecideModeration no reparte puntos'));
  }

  save(reporterKey: string, value: number): Promise<void> {
    this.values.set(reporterKey, value);
    return Promise.resolve();
  }
}

function setup(saved: Observation[]) {
  const observations = new InMemoryObservations(saved);
  const moderation = new InMemoryModeration(observations);
  const reputations = new InMemoryReputations();
  const published: DomainEvent[] = [];
  const decide = new DecideModeration({
    moderation,
    observations,
    reputations,
    events: {
      publish: (event) => {
        published.push(event);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { moderation, reputations, published, decide };
}

describe('decisión de moderación (RF-013)', () => {
  // RN3: toda decisión exige un motivo.
  it.each(['', '   ', 'Muy corto'])(
    'sin un motivo de al menos 10 caracteres ("%s") no se registra',
    async (shortNote) => {
      const reported = observation({ verdict: suspicious });
      const { moderation, decide } = setup([reported]);

      await expect(
        decide.execute({
          reportId: reported.reportId,
          decision: 'descartar',
          note: shortNote,
          moderatorKey: 'moderadora',
        }),
      ).rejects.toThrow(InvalidNoteError);
      expect(moderation.log).toEqual([]);
      expect(reported.moderation).toBeUndefined();
    },
  );

  it('aprobar deja el reporte aprobado, lo anota en la bitácora y lo publica como precio normal', async () => {
    const reported = observation({ verdict: suspicious, priceCop: 2000 });
    const { moderation, published, decide } = setup([reported]);

    await decide.execute({
      reportId: reported.reportId,
      decision: 'aprobar',
      note,
      moderatorKey: 'moderadora',
    });

    expect(reported.moderation).toBe('aprobado');
    expect(moderation.log).toEqual([
      {
        reportId: reported.reportId,
        decision: 'aprobar',
        note,
        moderatorKey: 'moderadora',
        decidedAt: now,
      },
    ]);
    expect(published).toEqual([
      expect.objectContaining({
        type: 'PriceAssessed',
        version: 1,
        payload: {
          reportId: reported.reportId,
          presentationId: 'arroz-500g',
          establishmentId: 'don-jose',
          priceCop: 2000,
          priceType: 'normal',
          observedAt: reported.observedAt.toISOString(),
          receivedAt: reported.receivedAt.toISOString(),
          verdict: 'normal',
          reason: null,
        },
      }),
    ]);
  });

  it('solo se decide sobre un reporte de la cola: no uno desconocido, normal sin marcas o ya decidido', async () => {
    const normal = observation();
    const decided = observation({ verdict: suspicious, moderation: 'aprobado' });
    const { moderation, published, decide } = setup([normal, decided]);

    for (const reportId of ['no-existe', normal.reportId, decided.reportId]) {
      await expect(
        decide.execute({ reportId, decision: 'descartar', note, moderatorKey: 'moderadora' }),
      ).rejects.toThrow(ReportNotInQueueError);
    }
    expect(moderation.log).toEqual([]);
    expect(published).toEqual([]);
  });

  it('descartar deja el reporte descartado y baja 0,20 la reputación de su autor', async () => {
    const reported = observation({ verdict: suspicious, reporterKey: 'autor-dudoso' });
    const { reputations, decide } = setup([reported]);
    reputations.values.set('autor-dudoso', 0.6);

    await decide.execute({
      reportId: reported.reportId,
      decision: 'descartar',
      note,
      moderatorKey: 'moderadora',
    });

    expect(reported.moderation).toBe('descartado');
    expect(reputations.values.get('autor-dudoso')).toBeCloseTo(0.4);
  });

  it('descartar retira el precio y propone el confiable más reciente de la misma tienda', async () => {
    const older = observation({ priceCop: 3900, observedAt: hoursAgo(30) });
    const latest = observation({ priceCop: 4100, observedAt: hoursAgo(5) });
    const otherSuspicious = observation({ verdict: suspicious, observedAt: hoursAgo(4) });
    const discarded = observation({ moderation: 'descartado', observedAt: hoursAgo(3) });
    const elsewhere = observation({ establishmentId: 'otra-tienda', observedAt: hoursAgo(2) });
    const reported = observation({ verdict: suspicious, priceCop: 2000, observedAt: hoursAgo(1) });
    const { published, decide } = setup([
      older,
      latest,
      otherSuspicious,
      discarded,
      elsewhere,
      reported,
    ]);

    await decide.execute({
      reportId: reported.reportId,
      decision: 'descartar',
      note,
      moderatorKey: 'moderadora',
    });

    expect(published).toEqual([
      expect.objectContaining({
        type: 'PriceWithdrawn',
        version: 1,
        payload: {
          reportId: reported.reportId,
          presentationId: 'arroz-500g',
          establishmentId: 'don-jose',
          replacement: {
            reportId: latest.reportId,
            priceCop: 4100,
            priceType: 'normal',
            observedAt: latest.observedAt.toISOString(),
            receivedAt: latest.receivedAt.toISOString(),
          },
        },
      }),
    ]);
  });

  it('descartar el único precio de la tienda lo retira sin reemplazo', async () => {
    const reported = observation({ verdict: suspicious });
    const { published, decide } = setup([reported]);

    await decide.execute({
      reportId: reported.reportId,
      decision: 'descartar',
      note,
      moderatorKey: 'moderadora',
    });

    expect(published).toEqual([
      expect.objectContaining({
        type: 'PriceWithdrawn',
        payload: expect.objectContaining({ replacement: null }) as unknown,
      }),
    ]);
  });

  // Grill de la #32, pregunta 1: su efecto sobre las cuentas llega con la #33.
  it('observar las cuentas solo queda en la bitácora: el reporte sigue en la cola', async () => {
    const reported = observation({ verdict: suspicious, reporterKey: 'autor-dudoso' });
    const { moderation, reputations, published, decide } = setup([reported]);

    await decide.execute({
      reportId: reported.reportId,
      decision: 'observar_cuentas',
      note,
      moderatorKey: 'moderadora',
    });

    expect(moderation.log.map((entry) => entry.decision)).toEqual(['observar_cuentas']);
    expect(reported.moderation).toBeUndefined();
    expect(reputations.values.size).toBe(0);
    expect(published).toEqual([]);
  });
});
