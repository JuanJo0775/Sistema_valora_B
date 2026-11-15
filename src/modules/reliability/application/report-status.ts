import { appealableUntil, isAppealable } from '../../../domain/appeal';
import { ReportNotFoundError } from './flag-report';
import type { ModerationStore, ObservationStore } from './stores';

export interface ReportStatusPorts {
  observations: Pick<ObservationStore, 'byReportId'>;
  moderation: Pick<ModerationStore, 'pending' | 'revisionOf' | 'appealOf'>;
  clock: { now(): Date };
}

export type ReportState =
  | 'normal'
  | 'en_revision'
  | 'descartado'
  | 'apelacion_pendiente'
  | 'apelacion_aceptada'
  | 'apelacion_rechazada';

// Grill de la #71, pregunta 1: lo que el autor sabe de su reporte, nunca quién decidió ni quién marcó.
export interface ReportStatusView {
  reportId: string;
  status: ReportState;
  // Solo si todavía se puede apelar.
  appealableUntil?: Date;
}

const APPEAL_STATE = {
  aceptada: 'apelacion_aceptada',
  rechazada: 'apelacion_rechazada',
} as const;

export class ReportStatus {
  constructor(private readonly ports: ReportStatusPorts) {}

  async of(reportId: string, reporterKey: string): Promise<ReportStatusView> {
    const { observations, moderation, clock } = this.ports;
    const reported = await observations.byReportId(reportId);
    // Un reporte de otra cuenta responde igual que uno que no existe.
    if (reported?.reporterKey !== reporterKey) throw new ReportNotFoundError(reportId);

    const appeal = await moderation.appealOf(reportId);
    if (appeal) {
      return {
        reportId,
        status: appeal.outcome ? APPEAL_STATE[appeal.outcome] : 'apelacion_pendiente',
      };
    }
    if (reported.moderation === 'descartado') {
      const discard = await moderation.revisionOf(reportId);
      const open = discard && isAppealable(discard.decidedAt, clock.now());
      return {
        reportId,
        status: 'descartado',
        ...(open ? { appealableUntil: appealableUntil(discard.decidedAt) } : {}),
      };
    }
    const inQueue = (await moderation.pending()).some(
      (item) => item.observation.reportId === reportId,
    );
    return { reportId, status: inQueue ? 'en_revision' : 'normal' };
  }
}
