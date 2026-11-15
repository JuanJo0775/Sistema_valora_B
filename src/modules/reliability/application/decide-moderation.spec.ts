import type { AnomalyResult } from '../../../domain/anomaly';
import type { DomainEvent } from '../../../shared/events';
import { DecideModeration, InvalidNoteError } from './decide-moderation';
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
});
