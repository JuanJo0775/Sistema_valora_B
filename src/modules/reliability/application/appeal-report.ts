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

// RF-013 RN4 (grill de la #71): el autor de un reporte descartado pide que otro moderador lo revise.
export class AppealReport {
  constructor(private readonly ports: AppealReportPorts) {}

  async execute(request: AppealRequest): Promise<void> {
    const { moderation, clock } = this.ports;
    await moderation.appeal({
      reportId: request.reportId,
      note: request.note,
      createdAt: clock.now(),
    });
  }
}
