import { createEvent, type DomainEvent } from '../../../shared/events';
import { PRICE_ASSESSED } from './assess-reported-price';
import type { Decision, ModerationStore, ObservationStore, ReputationStore } from './stores';

export interface DecideModerationPorts {
  moderation: ModerationStore;
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

// RF-013: el moderador decide sobre un reporte de la cola y la decisión queda en la bitácora.
export class DecideModeration {
  constructor(private readonly ports: DecideModerationPorts) {}

  async execute(request: DecisionRequest): Promise<void> {
    const note = request.note.trim();
    if (note.length < NOTE_LENGTH.min || note.length > NOTE_LENGTH.max) {
      throw new InvalidNoteError();
    }
    const { moderation, observations, events, clock } = this.ports;
    const reported = await observations.byReportId(request.reportId);
    await moderation.decide({ ...request, note, decidedAt: clock.now() });
    if (reported && request.decision === 'aprobar') {
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
    }
  }
}
