import { replacesCurrentPrice } from '../../../domain/current-price';
import { DAY_IN_MILLISECONDS } from '../../../domain/report-window';
import { SUSPENSION_PARAMS } from '../../../domain/suspension';
import { RELIABILITY_PARAMS, updateReputation } from '../../../domain/reliability';
import { createEvent, type DomainEvent } from '../../../shared/events';
import { PRICE_ASSESSED } from './assess-reported-price';
import { isReliable } from './standing';
import type {
  Decision,
  ModerationStore,
  Observation,
  ObservationStore,
  ReputationStore,
} from './stores';

export interface DecideModerationPorts {
  moderation: ModerationStore;
  observations: ObservationStore;
  reputations: ReputationStore;
  events: { publish(event: DomainEvent): Promise<void> };
  clock: { now(): Date };
}

export interface DecisionRequest {
  reportId: string;
  decision: Decision;
  note: string;
  // Clave seudónima de quien decide: la bitácora dice quién, sin guardar su cuenta.
  moderatorKey: string;
}

// RN3 de RF-013 y grill de la #32, pregunta 5: el motivo es obligatorio, de 10 a 500 caracteres.
export const NOTE_LENGTH = { min: 10, max: 500 } as const;

// Dato de entrada inválido: la capa HTTP la traduce a 400 VALIDATION_ERROR.
export class InvalidNoteError extends Error {
  constructor() {
    super(
      `El motivo es obligatorio, de ${String(NOTE_LENGTH.min)} a ${String(NOTE_LENGTH.max)} caracteres.`,
    );
    this.name = 'InvalidNoteError';
  }
}

export const PRICE_WITHDRAWN = 'PriceWithdrawn';
export const REPORTER_SUSPENSION_REQUESTED = 'ReporterSuspensionRequested';

// El precio que comparison mostraría sin el retirado: el confiable observado más recientemente.
const latestOf = (candidates: Observation[]): Observation | null =>
  candidates.reduce<Observation | null>(
    (latest, seen) => (latest === null || replacesCurrentPrice(seen, latest) ? seen : latest),
    null,
  );

// No existe, no está en revisión o ya se decidió: la capa HTTP la traduce a 404 NOT_FOUND.
export class ReportNotInQueueError extends Error {
  constructor(readonly reportId: string) {
    super(`El reporte ${reportId} no está en la cola de moderación.`);
    this.name = 'ReportNotInQueueError';
  }
}

// La decisión, la reputación y el evento se confirman juntos: el módulo arma DecideModeration dentro
// de una transacción y la capa HTTP solo ve esto.
export type ModerationDecider = Pick<DecideModeration, 'execute'>;
export const MODERATION_DECIDER = Symbol('ModerationDecider');

// RF-013: el moderador decide sobre un reporte de la cola y la decisión queda en la bitácora.
export class DecideModeration {
  constructor(private readonly ports: DecideModerationPorts) {}

  async execute(request: DecisionRequest): Promise<void> {
    const note = request.note.trim();
    if (note.length < NOTE_LENGTH.min || note.length > NOTE_LENGTH.max) {
      throw new InvalidNoteError();
    }
    const { moderation, events, clock } = this.ports;
    const item = (await moderation.pending()).find(
      (pending) => pending.observation.reportId === request.reportId,
    );
    if (!item) throw new ReportNotInQueueError(request.reportId);
    const reported = item.observation;
    const decidedAt = clock.now();
    await moderation.decide({ ...request, note, decidedAt });
    if (request.decision === 'aprobar') {
      // Grill de la #32, pregunta 4: comparison lo vuelve a mostrar como precio normal.
      await events.publish(
        createEvent(PRICE_ASSESSED, 1, {
          reportId: reported.reportId,
          presentationId: reported.presentationId,
          establishmentId: reported.establishmentId,
          priceCop: reported.priceCop,
          priceType: reported.priceType,
          observedAt: reported.observedAt.toISOString(),
          receivedAt: reported.receivedAt.toISOString(),
          verdict: 'normal',
          reason: null,
        }),
      );
    }
    if (request.decision === 'descartar') await this.discard(reported);
    if (request.decision === 'observar_cuentas') {
      // Grill de la #33, pregunta 2: el autor queda suspendido sin que el moderador sepa quién es.
      await events.publish(
        createEvent(REPORTER_SUSPENSION_REQUESTED, 1, {
          reporterKey: reported.reporterKey,
          reason: 'observar_cuentas',
          suspendedUntil: new Date(
            decidedAt.getTime() + SUSPENSION_PARAMS.days * DAY_IN_MILLISECONDS,
          ).toISOString(),
        }),
      );
    }
  }

  // Grill de la #32, pregunta 4: el autor pierde reputación y comparison deja de mostrar el precio.
  private async discard(reported: Observation): Promise<void> {
    const { observations, reputations, events } = this.ports;
    const current = await reputations.valuesOf([reported.reporterKey]);
    const value = current.get(reported.reporterKey) ?? RELIABILITY_PARAMS.neutralReputation;
    await reputations.save(reported.reporterKey, updateReputation(value, 'rejected'));

    const inStore = await observations.forPresentation(reported.presentationId, [
      reported.establishmentId,
    ]);
    const replacement = latestOf(
      inStore.filter((seen) => seen.reportId !== reported.reportId && isReliable(seen)),
    );
    await events.publish(
      createEvent(PRICE_WITHDRAWN, 1, {
        reportId: reported.reportId,
        presentationId: reported.presentationId,
        establishmentId: reported.establishmentId,
        replacement: replacement && {
          reportId: replacement.reportId,
          priceCop: replacement.priceCop,
          priceType: replacement.priceType,
          observedAt: replacement.observedAt.toISOString(),
          receivedAt: replacement.receivedAt.toISOString(),
        },
      }),
    );
  }
}
