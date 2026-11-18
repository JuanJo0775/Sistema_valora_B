import { createEvent, type DomainEvent } from '../../../shared/events';
import type { FlagReason, ModerationStore, ObservationStore } from './stores';

export interface FlagReportPorts {
  moderation: ModerationStore;
  observations: Pick<ObservationStore, 'byReportId'>;
  events: { publish(event: DomainEvent): Promise<void> };
  clock: { now(): Date };
}

export const PRICE_FLAGGED = 'PriceFlagged';

export interface FlagRequest {
  reportId: string;
  // Clave seudónima de quien marca (EC-08): nunca su cuenta.
  flaggerKey: string;
  reason: FlagReason;
  comment?: string;
}

// No es una regla de negocio incumplida (422): la capa HTTP la traduce a 404 NOT_FOUND.
export class ReportNotFoundError extends Error {
  constructor(readonly reportId: string) {
    super(`No existe el reporte ${reportId}.`);
    this.name = 'ReportNotFoundError';
  }
}

// RN1 de RF-013 y grill de la #32, pregunta 5: una marca por cuenta y reporte; la capa HTTP la
// traduce a 409 ALREADY_FLAGGED.
export class AlreadyFlaggedError extends Error {
  readonly code = 'ALREADY_FLAGGED';

  constructor(readonly reportId: string) {
    super('Esta cuenta ya marcó este reporte.');
    this.name = 'AlreadyFlaggedError';
  }
}

// La marca y el evento se confirman juntos: el módulo arma FlagReport dentro de una transacción.
export type ReportFlagger = Pick<FlagReport, 'execute'>;
export const REPORT_FLAGGER = Symbol('ReportFlagger');

// RF-013: una cuenta reportante marca un precio como dudoso para que lo revise un moderador.
export class FlagReport {
  constructor(private readonly ports: FlagReportPorts) {}

  async execute(request: FlagRequest): Promise<void> {
    const { moderation, observations, events, clock } = this.ports;
    const observation = await observations.byReportId(request.reportId);
    if (!observation) throw new ReportNotFoundError(request.reportId);
    const recorded = await moderation.flag({ ...request, createdAt: clock.now() });
    if (!recorded) throw new AlreadyFlaggedError(request.reportId);
    // EC-03: el reporte marcado entra a la cola de moderación, así que comparison deja de mostrarlo
    // como precio vigente hasta que se decida (aprobar lo devuelve, descartar lo retira). Si ya hay
    // decisión no vuelve a la cola, y entonces tampoco se oculta. Sin la clave de nadie (EC-08).
    if (observation.moderation === undefined) {
      await events.publish(
        createEvent(PRICE_FLAGGED, 1, {
          reportId: observation.reportId,
          presentationId: observation.presentationId,
          establishmentId: observation.establishmentId,
        }),
      );
    }
  }
}
