import { replacesCurrentPrice } from '../../../domain/current-price';
import { suspensionAfter, suspensionEnd } from '../../../domain/suspension';
import { RELIABILITY_PARAMS, updateReputation } from '../../../domain/reliability';
import { DomainError } from '../../../domain/domain-error';
import { createEvent, type DomainEvent } from '../../../shared/events';
import { PRICE_ASSESSED } from './assess-reported-price';
import { isReliable } from './standing';
import type {
  Decision,
  ModerationStore,
  Observation,
  ObservationStore,
  OfficialReview,
  OfficialReviewStore,
  ReputationStore,
} from './stores';

export interface DecideModerationPorts {
  moderation: ModerationStore;
  // ADR-037: los precios oficiales sin referencia que esperan decisión.
  officialReviews: OfficialReviewStore;
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
// ADR-037: lo que moderación decidió sobre un precio oficial en revisión; commerce lo escucha por su
// nombre. v1: { reviewId, establishmentId, presentationId, decision: 'aprobado' | 'descartado' }.
export const OFFICIAL_PRICE_REVIEWED = 'OfficialPriceReviewed';
export const REPORTER_SUSPENSION_REQUESTED = 'ReporterSuspensionRequested';
export const REPORTER_SUSPENSION_LIFTED = 'ReporterSuspensionLifted';

// El precio que comparison mostraría sin el retirado: el confiable observado más recientemente.
const latestOf = (candidates: Observation[]): Observation | null =>
  candidates.reduce<Observation | null>(
    (latest, seen) => (latest === null || replacesCurrentPrice(seen, latest) ? seen : latest),
    null,
  );

// Grill de la #73, pregunta 5: conflicto de interés; la capa HTTP lo traduce a 409 OWN_REPORT.
export class OwnReportError extends Error {
  readonly code = 'OWN_REPORT';

  constructor() {
    super('Un moderador no decide sobre sus propios reportes; lo decide otro moderador.');
    this.name = 'OwnReportError';
  }
}

// Grill de la #71, pregunta 3: una apelación la revisa otro moderador; la capa HTTP la traduce a 409.
export class SameModeratorError extends Error {
  readonly code = 'SAME_MODERATOR';

  constructor() {
    super('Quien descartó el reporte no decide su apelación; la decide otro moderador.');
    this.name = 'SameModeratorError';
  }
}

// Grill de la #71, pregunta 3: una apelación se acepta o se rechaza (422).
export class DecisionNotAllowedError extends DomainError {
  readonly code = 'DECISION_NOT_ALLOWED';

  constructor() {
    super('Una apelación solo se aprueba o se descarta.');
  }
}

// ADR-037: un precio oficial en revisión solo se aprueba o se descarta (422).
export class OfficialDecisionNotAllowedError extends DomainError {
  readonly code = 'DECISION_NOT_ALLOWED';

  constructor() {
    super('Un precio oficial en revisión solo se aprueba o se descarta.');
  }
}

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
    const { moderation, events, clock, officialReviews } = this.ports;
    const official = (await officialReviews.pending()).find(
      (review) => review.reviewId === request.reportId,
    );
    if (official) return this.decideOfficial(official, request, note);
    const item = (await moderation.pending()).find(
      (pending) => pending.observation.reportId === request.reportId,
    );
    if (!item) throw new ReportNotInQueueError(request.reportId);
    const reported = item.observation;
    if (reported.reporterKey === request.moderatorKey) throw new OwnReportError();
    const stage = item.appeal ? 'apelacion' : 'revision';
    if (stage === 'apelacion') await this.checkAppealDecision(request);
    const decidedAt = clock.now();
    await moderation.decide({ ...request, note, decidedAt, stage });
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
      // Grill de la #71, pregunta 4: aceptar la apelación devuelve lo que quitó el descarte.
      if (stage === 'apelacion') await this.acceptAppeal(reported);
    }
    // Grill de la #71, pregunta 4: rechazar la apelación deja el descarte como estaba, sin castigar
    // dos veces.
    if (request.decision === 'descartar' && stage === 'revision') {
      await this.discard(reported);
      // RN6 de RF-013: la decisión recién guardada ya está en la lista.
      const until = suspensionAfter(
        await moderation.decisionsAbout(reported.reporterKey),
        decidedAt,
      );
      if (until) await this.requestSuspension(reported, 'rechazos_seguidos', until);
    }
    if (request.decision === 'observar_cuentas') {
      // Grill de la #33, pregunta 2: el autor queda suspendido sin que el moderador sepa quién es.
      await this.requestSuspension(reported, 'observar_cuentas', suspensionEnd(decidedAt));
    }
  }

  // ADR-037: aprobar vuelve el precio el oficial vigente de la tienda; descartarlo lo retira. La
  // decisión queda en la misma bitácora; commerce la aplica al recibir OfficialPriceReviewed.
  private async decideOfficial(
    review: OfficialReview,
    request: DecisionRequest,
    note: string,
  ): Promise<void> {
    if (request.decision === 'observar_cuentas') throw new OfficialDecisionNotAllowedError();
    if (review.reporterKey === request.moderatorKey) throw new OwnReportError();
    const { moderation, officialReviews, events, clock } = this.ports;
    await moderation.decide({ ...request, note, decidedAt: clock.now(), stage: 'revision' });
    const decision = request.decision === 'aprobar' ? 'aprobado' : 'descartado';
    await officialReviews.decide(review.reviewId, decision);
    await events.publish(
      createEvent(OFFICIAL_PRICE_REVIEWED, 1, {
        reviewId: review.reviewId,
        establishmentId: review.establishmentId,
        presentationId: review.presentationId,
        decision,
      }),
    );
  }

  // Grill de la #71, pregunta 4: el descarte revertido devuelve la reputación y, si suspendió la
  // cuenta, la suspensión se levanta. identity solo la levanta si su fecha de fin es la de ese
  // descarte; si el descarte no la causó, la fecha no coincide y no pasa nada.
  private async acceptAppeal(reported: Observation): Promise<void> {
    await this.adjustReputation(reported, 'appealAccepted');
    const discard = await this.ports.moderation.revisionOf(reported.reportId);
    if (!discard) return;
    await this.ports.events.publish(
      createEvent(REPORTER_SUSPENSION_LIFTED, 1, {
        reporterKey: reported.reporterKey,
        suspendedUntil: suspensionEnd(discard.decidedAt).toISOString(),
      }),
    );
  }

  private async checkAppealDecision(request: DecisionRequest): Promise<void> {
    if (request.decision === 'observar_cuentas') throw new DecisionNotAllowedError();
    const discard = await this.ports.moderation.revisionOf(request.reportId);
    if (discard?.moderatorKey === request.moderatorKey) throw new SameModeratorError();
  }

  // Grill de la #33, pregunta 6: identity suspende la cuenta al recibir el evento.
  private async requestSuspension(
    reported: Observation,
    reason: 'observar_cuentas' | 'rechazos_seguidos',
    suspendedUntil: Date,
  ): Promise<void> {
    await this.ports.events.publish(
      createEvent(REPORTER_SUSPENSION_REQUESTED, 1, {
        reporterKey: reported.reporterKey,
        reason,
        suspendedUntil: suspendedUntil.toISOString(),
      }),
    );
  }

  // Grill de la #32, pregunta 4: el autor pierde reputación y comparison deja de mostrar el precio.
  private async adjustReputation(
    reported: Observation,
    event: 'rejected' | 'appealAccepted',
  ): Promise<void> {
    const { reputations } = this.ports;
    const current = await reputations.valuesOf([reported.reporterKey]);
    const value = current.get(reported.reporterKey) ?? RELIABILITY_PARAMS.neutralReputation;
    await reputations.save(reported.reporterKey, updateReputation(value, event));
  }

  private async discard(reported: Observation): Promise<void> {
    const { observations, events } = this.ports;
    await this.adjustReputation(reported, 'rejected');

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
