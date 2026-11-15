import type { ModerationStore, PendingItem } from './stores';

export interface ModerationQueuePorts {
  moderation: Pick<ModerationStore, 'pending'>;
  // Consultas públicas de catalog y establishments (por su index.ts).
  labels: { of(presentationIds: string[]): Promise<Map<string, string>> };
  names: { of(establishmentIds: string[]): Promise<Map<string, string>> };
}

export type QueueReason = 'apelacion' | 'desviacion' | 'rafaga' | 'marcado';

// Grill de la #32, pregunta 6: lo que el moderador necesita para decidir, nunca quién reportó ni
// quién marcó (EC-08).
export interface QueueItem {
  id: string;
  reason: QueueReason;
  productName: string;
  establishmentName: string;
  reportedPriceCop: number;
  medianPriceCop?: number;
  deviationPercent?: number;
  reportersCount: number;
  createdAt: Date;
  // Grill de la #71, pregunta 3: el motivo del autor, solo en las apelaciones.
  appealNote?: string;
}

export interface QueueRequest {
  reason?: QueueReason;
  limit?: number;
}

// Pregunta 3: si la detección lo marcó sospechoso, el motivo es la desviación aunque también
// tenga marcas.
const reasonOf = ({ observation, appeal, burst }: PendingItem): QueueReason => {
  // Grill de la #71, pregunta 3: una apelación es un caso ya revisado que espera respuesta.
  if (appeal) return 'apelacion';
  if (observation.verdict.status === 'sospechoso') return 'desviacion';
  return burst ? 'rafaga' : 'marcado';
};

// Grill de la #32, pregunta 6.
export const DEFAULT_QUEUE_LIMIT = 20;
// Grill de la #71, pregunta 3: las apelaciones van antes que todo.
// Grill de la #29: la ráfaga va después de las desviaciones y antes de las marcas.
const QUEUE_ORDER: QueueReason[] = ['apelacion', 'desviacion', 'rafaga', 'marcado'];
const UNNAMED = 'Sin nombre';

const deviationOf = ({ observation }: PendingItem): number =>
  'deviation' in observation.verdict ? observation.verdict.deviation : 0;

// RN2 de RF-013: primero las desviaciones (la mayor primero), luego las marcas (más marcas
// primero); en empate, el que llegó antes.
const bySeverity = (a: PendingItem, b: PendingItem): number => {
  const rank = (item: PendingItem) => QUEUE_ORDER.indexOf(reasonOf(item));
  return (
    rank(a) - rank(b) ||
    deviationOf(b) - deviationOf(a) ||
    b.flags - a.flags ||
    a.observation.receivedAt.getTime() - b.observation.receivedAt.getTime()
  );
};

// RF-013: la cola de reportes pendientes de decisión, solo para moderadores.
export class ModerationQueue {
  constructor(private readonly ports: ModerationQueuePorts) {}

  async list(request: QueueRequest): Promise<QueueItem[]> {
    const pending = (await this.ports.moderation.pending())
      .filter((item) => request.reason === undefined || reasonOf(item) === request.reason)
      .sort(bySeverity)
      .slice(0, request.limit ?? DEFAULT_QUEUE_LIMIT);
    const [labels, names] = await Promise.all([
      this.ports.labels.of([...new Set(pending.map((item) => item.observation.presentationId))]),
      this.ports.names.of([...new Set(pending.map((item) => item.observation.establishmentId))]),
    ]);
    return pending.map((item) => {
      const { observation } = item;
      const { verdict } = observation;
      return {
        id: observation.reportId,
        reason: reasonOf(item),
        productName: labels.get(observation.presentationId) ?? UNNAMED,
        establishmentName: names.get(observation.establishmentId) ?? UNNAMED,
        reportedPriceCop: observation.priceCop,
        ...('median' in verdict
          ? {
              medianPriceCop: verdict.median,
              deviationPercent: Math.round(verdict.deviation * 100),
            }
          : {}),
        reportersCount: item.flags,
        createdAt: observation.receivedAt,
        ...(item.appeal ? { appealNote: item.appeal.note } : {}),
      };
    });
  }
}
