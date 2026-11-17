import type { FlagReason, ModerationStore, ObservationStore } from './stores';

export interface FlagReportPorts {
  moderation: ModerationStore;
  observations: Pick<ObservationStore, 'byReportId'>;
  clock: { now(): Date };
}

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

// RF-013: una cuenta reportante marca un precio como dudoso para que lo revise un moderador.
export class FlagReport {
  constructor(private readonly ports: FlagReportPorts) {}

  async execute(request: FlagRequest): Promise<void> {
    const { moderation, observations, clock } = this.ports;
    if (!(await observations.byReportId(request.reportId))) {
      throw new ReportNotFoundError(request.reportId);
    }
    const recorded = await moderation.flag({ ...request, createdAt: clock.now() });
    if (!recorded) throw new AlreadyFlaggedError(request.reportId);
  }
}
