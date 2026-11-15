import { appealableUntil, isAppealable } from '../../../domain/appeal';
import { ReportNotFoundError } from './flag-report';
import type { AuthoredReport, ModerationStore, ObservationStore } from './stores';

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

// Grill de la #76: la misma regla para el estado de un reporte y para la lista de aportes.
export function reportStateOf(
  report: AuthoredReport,
  now: Date,
): { status: ReportState; appealableUntil?: Date } {
  const { observation, flags, appeal, discardedAt } = report;
  if (appeal) {
    return { status: appeal.outcome ? APPEAL_STATE[appeal.outcome] : 'apelacion_pendiente' };
  }
  if (observation.moderation === 'descartado') {
    const open = discardedAt && isAppealable(discardedAt, now);
    return {
      status: 'descartado',
      ...(open ? { appealableUntil: appealableUntil(discardedAt) } : {}),
    };
  }
  const inQueue =
    observation.moderation === undefined &&
    (observation.verdict.status === 'sospechoso' || flags > 0);
  return { status: inQueue ? 'en_revision' : 'normal' };
}

export class ReportStatus {
  constructor(private readonly ports: ReportStatusPorts) {}

  async of(reportId: string, reporterKey: string): Promise<ReportStatusView> {
    const { observations, moderation, clock } = this.ports;
    const reported = await observations.byReportId(reportId);
    // Un reporte de otra cuenta responde igual que uno que no existe.
    if (reported?.reporterKey !== reporterKey) throw new ReportNotFoundError(reportId);

    const [appeal, revision, pending] = await Promise.all([
      moderation.appealOf(reportId),
      moderation.revisionOf(reportId),
      moderation.pending(),
    ]);
    const flags = pending.find((item) => item.observation.reportId === reportId)?.flags ?? 0;
    const discardedAt = revision?.decision === 'descartar' ? revision.decidedAt : null;
    return {
      reportId,
      ...reportStateOf({ observation: reported, flags, appeal, discardedAt }, clock.now()),
    };
  }
}
