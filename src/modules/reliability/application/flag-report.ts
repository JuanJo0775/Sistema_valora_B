import type { FlagReason, ModerationStore, Observation } from './stores';

export interface FlagReportPorts {
  moderation: ModerationStore;
  observations: { byReportId(reportId: string): Promise<Observation | null> };
  clock: { now(): Date };
}

export interface FlagRequest {
  reportId: string;
  // Clave seudónima de quien marca (EC-08): nunca su cuenta.
  flaggerKey: string;
  reason: FlagReason;
  comment?: string;
}

// RF-013: una cuenta reportante marca un precio como dudoso para que lo revise un moderador.
export class FlagReport {
  constructor(private readonly ports: FlagReportPorts) {}

  async execute(request: FlagRequest): Promise<void> {
    await this.ports.moderation.flag({ ...request, createdAt: this.ports.clock.now() });
  }
}
