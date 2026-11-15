import type { AnomalyResult } from '../../../domain/anomaly';
import type { DomainEvent } from '../../../shared/events';
import {
  DecideModeration,
  DecisionNotAllowedError,
  InvalidNoteError,
  OwnReportError,
  ReportNotInQueueError,
  SameModeratorError,
} from './decide-moderation';
import type {
  AppealRecord,
  Decision,
  LogEntry,
  ModerationStore,
  NewAppeal,
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

// Como DrizzleModerationStore: la decisión cambia el estado de la observación, y las apelaciones
// pendientes también están en la cola (grill de la #71).
class InMemoryModeration implements ModerationStore {
  readonly log: LogEntry[] = [];
  readonly flags: NewFlag[] = [];
  readonly appeals: NewAppeal[] = [];

  constructor(private readonly observations: InMemoryObservations) {}

  flag(flag: NewFlag): Promise<boolean> {
    this.flags.push(flag);
    return Promise.resolve(true);
  }

  pending(): Promise<PendingItem[]> {
    const flagsOf = (reportId: string) =>
      this.flags.filter((flag) => flag.reportId === reportId).length;
    const inReview = this.observations.saved
      .map((seen) => ({ observation: seen, flags: flagsOf(seen.reportId) }))
      .filter(
        (item) =>
          item.observation.moderation === undefined &&
          (item.observation.verdict.status === 'sospechoso' || item.flags > 0),
      );
    const appealed = this.appeals
      .filter((appeal) => !this.appealDecision(appeal.reportId))
      .flatMap((appeal) => {
        const seen = this.observations.saved.find((saved) => saved.reportId === appeal.reportId);
        return seen
          ? [
              {
                observation: seen,
                flags: flagsOf(seen.reportId),
                appeal: { note: appeal.note, createdAt: appeal.createdAt },
              },
            ]
          : [];
      });
    return Promise.resolve([...inReview, ...appealed]);
  }

  decide(entry: LogEntry): Promise<void> {
    this.log.push(entry);
    const seen = this.observations.saved.find((saved) => saved.reportId === entry.reportId);
    const keepsState =
      entry.decision === 'observar_cuentas' ||
      (entry.stage === 'apelacion' && entry.decision === 'descartar');
    if (seen && !keepsState) {
      seen.moderation = entry.decision === 'aprobar' ? 'aprobado' : 'descartado';
    }
    return Promise.resolve();
  }

  // Las decisiones de revisión sobre los reportes de una clave, en orden; un descarte revertido
  // por una apelación aceptada cuenta como aprobar.
  decisionsAbout(reporterKey: string): Promise<Decision[]> {
    const authored = new Set(
      this.observations.saved
        .filter((seen) => seen.reporterKey === reporterKey)
        .map((seen) => seen.reportId),
    );
    return Promise.resolve(
      this.log
        .filter((entry) => entry.stage === 'revision' && authored.has(entry.reportId))
        .map((entry) =>
          entry.decision === 'descartar' &&
          this.appealDecision(entry.reportId)?.decision === 'aprobar'
            ? 'aprobar'
            : entry.decision,
        ),
    );
  }

  appeal(appeal: NewAppeal): Promise<boolean> {
    const repeated = this.appeals.some((seen) => seen.reportId === appeal.reportId);
    if (!repeated) this.appeals.push(appeal);
    return Promise.resolve(!repeated);
  }

  appealOf(reportId: string): Promise<AppealRecord | null> {
    const found = this.appeals.find((appeal) => appeal.reportId === reportId);
    if (!found) return Promise.resolve(null);
    const decided = this.appealDecision(reportId);
    const outcome = decided ? (decided.decision === 'aprobar' ? 'aceptada' : 'rechazada') : null;
    return Promise.resolve({ note: found.note, createdAt: found.createdAt, outcome });
  }

  revisionOf(reportId: string): Promise<LogEntry | null> {
    const revisions = this.log.filter(
      (entry) => entry.reportId === reportId && entry.stage === 'revision',
    );
    return Promise.resolve(revisions.at(-1) ?? null);
  }

  private appealDecision(reportId: string): LogEntry | undefined {
    return this.log.find((entry) => entry.reportId === reportId && entry.stage === 'apelacion');
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
        stage: 'revision',
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

  // Grill de la #33, pregunta 2: observar las cuentas suspende 7 días al autor del reporte.
  it('observar las cuentas pide suspender al autor 7 días; el reporte sigue en la cola', async () => {
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
    expect(published).toEqual([
      expect.objectContaining({
        type: 'ReporterSuspensionRequested',
        version: 1,
        payload: {
          reporterKey: 'autor-dudoso',
          reason: 'observar_cuentas',
          suspendedUntil: '2026-11-21T14:00:00.000Z',
        },
      }),
    ]);
  });

  // Grill de la #73, pregunta 5: la clave del moderador es la misma que tenía como reportante.
  it('un moderador no decide sobre un reporte propio', async () => {
    const own = observation({ verdict: suspicious, reporterKey: 'clave-de-la-moderadora' });
    const { moderation, published, decide } = setup([own]);

    await expect(
      decide.execute({
        reportId: own.reportId,
        decision: 'aprobar',
        note,
        moderatorKey: 'clave-de-la-moderadora',
      }),
    ).rejects.toThrow(OwnReportError);
    expect(moderation.log).toEqual([]);
    expect(published).toEqual([]);
  });

  // RN6 de RF-013 y grill de la #33, pregunta 5.
  describe('suspensión por descartes seguidos', () => {
    const discardAll = async (decide: DecideModeration, reports: Observation[]) => {
      for (const report of reports) {
        await decide.execute({
          reportId: report.reportId,
          decision: report.priceCop === 4000 ? 'aprobar' : 'descartar',
          note,
          moderatorKey: 'moderadora',
        });
      }
    };
    const fromAuthor = (priceCop = 2000) =>
      observation({ verdict: suspicious, reporterKey: 'autor-dudoso', priceCop });
    const suspensions = (published: DomainEvent[]) =>
      published.filter((event) => event.type === 'ReporterSuspensionRequested');

    it('el tercer descarte seguido del mismo autor pide suspenderlo 7 días', async () => {
      const reports = [fromAuthor(), fromAuthor(), fromAuthor()];
      const { published, decide } = setup(reports);

      await discardAll(decide, reports);

      expect(suspensions(published)).toEqual([
        expect.objectContaining({
          version: 1,
          payload: {
            reporterKey: 'autor-dudoso',
            reason: 'rechazos_seguidos',
            suspendedUntil: '2026-11-21T14:00:00.000Z',
          },
        }),
      ]);
    });

    it('con un aprobar en medio no se pide la suspensión', async () => {
      // El reporte de 4000 se aprueba (ver discardAll).
      const reports = [fromAuthor(), fromAuthor(4000), fromAuthor(), fromAuthor()];
      const { published, decide } = setup(reports);

      await discardAll(decide, reports);

      expect(suspensions(published)).toEqual([]);
    });

    it('los descartes de otros autores no cuentan para la racha', async () => {
      const reports = [fromAuthor(), fromAuthor(), observation({ verdict: suspicious })];
      const { published, decide } = setup(reports);

      await discardAll(decide, reports);

      expect(suspensions(published)).toEqual([]);
    });
  });

  // Grill de la #71: la apelación de un reporte descartado.
  describe('apelaciones', () => {
    // Un reporte que la moderadora A descartó y su autor apeló.
    const appealedSetup = async (extra: Observation[] = []) => {
      const reported = observation({
        verdict: suspicious,
        reporterKey: 'autor-dudoso',
        priceCop: 2000,
      });
      const context = setup([reported, ...extra]);
      await context.decide.execute({
        reportId: reported.reportId,
        decision: 'descartar',
        note,
        moderatorKey: 'moderadora-a',
      });
      await context.moderation.appeal({
        reportId: reported.reportId,
        note: 'El precio sí era ese, está en la etiqueta',
        createdAt: now,
      });
      context.published.length = 0;
      return { ...context, reported };
    };

    it('quien descartó no decide la apelación; otra moderadora sí', async () => {
      const { reported, decide } = await appealedSetup();

      await expect(
        decide.execute({
          reportId: reported.reportId,
          decision: 'aprobar',
          note,
          moderatorKey: 'moderadora-a',
        }),
      ).rejects.toThrow(SameModeratorError);
      await decide.execute({
        reportId: reported.reportId,
        decision: 'aprobar',
        note,
        moderatorKey: 'moderadora-b',
      });
    });

    it('observar las cuentas no aplica a una apelación', async () => {
      const { reported, moderation, decide } = await appealedSetup();

      await expect(
        decide.execute({
          reportId: reported.reportId,
          decision: 'observar_cuentas',
          note,
          moderatorKey: 'moderadora-b',
        }),
      ).rejects.toThrow(DecisionNotAllowedError);
      expect(moderation.log.filter((entry) => entry.stage === 'apelacion')).toEqual([]);
    });

    it('aceptarla deja el reporte aprobado, lo publica como normal y devuelve la reputación', async () => {
      const { reported, reputations, published, decide } = await appealedSetup();
      expect(reputations.values.get('autor-dudoso')).toBeCloseTo(0.3);

      await decide.execute({
        reportId: reported.reportId,
        decision: 'aprobar',
        note,
        moderatorKey: 'moderadora-b',
      });

      expect(reported.moderation).toBe('aprobado');
      expect(reputations.values.get('autor-dudoso')).toBeCloseTo(0.5);
      expect(published).toEqual([
        expect.objectContaining({
          type: 'PriceAssessed',
          payload: expect.objectContaining({
            reportId: reported.reportId,
            verdict: 'normal',
          }) as unknown,
        }),
      ]);
    });

    // Grill de la #71, pregunta 4: identity solo la levanta si su fecha coincide con esta.
    it('aceptarla pide levantar la suspensión que pudo causar ese descarte', async () => {
      const { reported, published, decide } = await appealedSetup();

      await decide.execute({
        reportId: reported.reportId,
        decision: 'aprobar',
        note,
        moderatorKey: 'moderadora-b',
      });

      expect(published.filter((event) => event.type === 'ReporterSuspensionLifted')).toEqual([
        expect.objectContaining({
          version: 1,
          payload: { reporterKey: 'autor-dudoso', suspendedUntil: '2026-11-21T14:00:00.000Z' },
        }),
      ]);
    });
  });
});
