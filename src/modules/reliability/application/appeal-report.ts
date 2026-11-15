import { isAppealable } from '../../../domain/appeal';
import { DomainError } from '../../../domain/domain-error';
import { NOTE_LENGTH } from './decide-moderation';
import { ReportNotFoundError } from './flag-report';
import type { ModerationStore, ObservationStore } from './stores';

export interface AppealReportPorts {
  observations: Pick<ObservationStore, 'byReportId'>;
  moderation: Pick<ModerationStore, 'revisionOf' | 'appeal'>;
  clock: { now(): Date };
}

export interface AppealRequest {
  reportId: string;
  // Clave seudónima de quien apela (EC-08): solo puede ser la del autor.
  appellantKey: string;
  note: string;
}

// Dato de entrada inválido: la capa HTTP lo traduce a 400 VALIDATION_ERROR.
export class InvalidAppealNoteError extends Error {
  constructor() {
    super(
      `El motivo es obligatorio, de ${String(NOTE_LENGTH.min)} a ${String(NOTE_LENGTH.max)} caracteres.`,
    );
    this.name = 'InvalidAppealNoteError';
  }
}

// Reglas de negocio incumplidas: el filtro de errores responde 422 con su código.
export class NotAppealableError extends DomainError {
  readonly code = 'NOT_APPEALABLE';

  constructor() {
    super('Solo se apela un reporte descartado.');
  }
}

export class AppealWindowClosedError extends DomainError {
  readonly code = 'APPEAL_WINDOW_CLOSED';

  constructor() {
    super('Pasó el plazo para apelar este reporte.');
  }
}

// RN4: una sola vez; la capa HTTP la traduce a 409.
export class AlreadyAppealedError extends Error {
  readonly code = 'ALREADY_APPEALED';

  constructor() {
    super('Este reporte ya se apeló.');
    this.name = 'AlreadyAppealedError';
  }
}

// RF-013 RN4 (grill de la #71): el autor de un reporte descartado pide que otro moderador lo revise.
export class AppealReport {
  constructor(private readonly ports: AppealReportPorts) {}

  async execute(request: AppealRequest): Promise<void> {
    const note = request.note.trim();
    if (note.length < NOTE_LENGTH.min || note.length > NOTE_LENGTH.max) {
      throw new InvalidAppealNoteError();
    }
    const { observations, moderation, clock } = this.ports;
    const reported = await observations.byReportId(request.reportId);
    // Pregunta 1: un reporte de otra cuenta responde igual que uno que no existe.
    if (reported?.reporterKey !== request.appellantKey) {
      throw new ReportNotFoundError(request.reportId);
    }
    const discard = await moderation.revisionOf(request.reportId);
    if (reported.moderation !== 'descartado' || discard?.decision !== 'descartar') {
      throw new NotAppealableError();
    }
    const now = clock.now();
    if (!isAppealable(discard.decidedAt, now)) throw new AppealWindowClosedError();
    const recorded = await moderation.appeal({ reportId: request.reportId, note, createdAt: now });
    if (!recorded) throw new AlreadyAppealedError();
  }
}
