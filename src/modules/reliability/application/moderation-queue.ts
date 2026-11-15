import type { ModerationStore, PendingItem } from './stores';

export interface ModerationQueuePorts {
  moderation: Pick<ModerationStore, 'pending'>;
  // Consultas públicas de catalog y establishments (por su index.ts).
  labels: { of(presentationIds: string[]): Promise<Map<string, string>> };
  names: { of(establishmentIds: string[]): Promise<Map<string, string>> };
}

export type QueueReason = 'desviacion' | 'marcado';

// Grill de la #32, pregunta 6: lo que el moderador necesita para decidir, nunca quién reportó ni
// quién marcó (EC-08).
export interface QueueItem {
  id: string;
  reason: QueueReason;
  productName?: string;
  establishmentName?: string;
  reportedPriceCop: number;
  medianPriceCop?: number;
  deviationPercent?: number;
  reportersCount: number;
  createdAt: Date;
}

export interface QueueRequest {
  reason?: QueueReason;
  limit?: number;
}

// Pregunta 3: si la detección lo marcó sospechoso, el motivo es la desviación aunque también
// tenga marcas.
const reasonOf = ({ observation }: PendingItem): QueueReason =>
  observation.verdict.status === 'sospechoso' ? 'desviacion' : 'marcado';

// RF-013: la cola de reportes pendientes de decisión, solo para moderadores.
export class ModerationQueue {
  constructor(private readonly ports: ModerationQueuePorts) {}

  async list(_request: QueueRequest): Promise<QueueItem[]> {
    const pending = await this.ports.moderation.pending();
    const [labels, names] = await Promise.all([
      this.ports.labels.of([...new Set(pending.map((item) => item.observation.presentationId))]),
      this.ports.names.of([...new Set(pending.map((item) => item.observation.establishmentId))]),
    ]);
    return pending.map((item) => {
      const { observation } = item;
      const { verdict } = observation;
      const productName = labels.get(observation.presentationId);
      const establishmentName = names.get(observation.establishmentId);
      return {
        id: observation.reportId,
        reason: reasonOf(item),
        ...(productName === undefined ? {} : { productName }),
        ...(establishmentName === undefined ? {} : { establishmentName }),
        reportedPriceCop: observation.priceCop,
        ...('median' in verdict
          ? {
              medianPriceCop: verdict.median,
              deviationPercent: Math.round(verdict.deviation * 100),
            }
          : {}),
        reportersCount: item.flags,
        createdAt: observation.receivedAt,
      };
    });
  }
}
