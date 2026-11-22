import { DomainError } from '../../../domain/domain-error';
import { createEvent } from '../../../shared/events';
import type { EstablishmentRepository } from './establishment-repository';
import type { StoreProposalDecision, StoreProposalRepository } from './store-proposals';

export interface DecideStoreProposalPorts {
  proposals: Pick<StoreProposalRepository, 'decide'>;
  stores: Pick<EstablishmentRepository, 'exists'>;
  clock: { now(): Date };
}

export interface StoreProposalDecisionRequest {
  proposalId: string;
  decision: StoreProposalDecision;
  mergeInto?: string;
  note: string;
  // Clave seudónima del moderador (EC-08).
  moderatorKey: string;
}

// Grill de la #27, pregunta 1: el motivo es obligatorio, como en la moderación de precios (#32).
export const PROPOSAL_NOTE_LENGTH = { min: 10, max: 500 } as const;

// Dato de entrada inválido: la capa HTTP lo traduce a 400.
export class InvalidProposalNoteError extends Error {
  constructor() {
    super(
      `El motivo es obligatorio, de ${String(PROPOSAL_NOTE_LENGTH.min)} a ${String(PROPOSAL_NOTE_LENGTH.max)} caracteres.`,
    );
    this.name = 'InvalidProposalNoteError';
  }
}

// No existe o ya se decidió: la capa HTTP lo traduce a 404.
export class StoreProposalNotFoundError extends Error {
  constructor() {
    super('La propuesta no existe o ya se decidió.');
    this.name = 'StoreProposalNotFoundError';
  }
}

// RF-005 RN3: solo se fusiona con una tienda que existe (422).
export class MergeTargetNotFoundError extends DomainError {
  readonly code = 'UNKNOWN_ESTABLISHMENT';

  constructor() {
    super('La tienda con la que se quiere fusionar no existe.');
  }
}

// D2 del grill comercial: commerce verifica al comercio pre-aprobado de la tienda propuesta. Solo se
// publica el nombre del evento: establishments no conoce commerce.
export const STORE_PROPOSAL_DECIDED = 'StoreProposalDecided';

// RF-005 RN3 y RN7: el moderador aprueba (aparece en el mapa), fusiona o rechaza una tienda propuesta.
export class DecideStoreProposal {
  constructor(private readonly ports: DecideStoreProposalPorts) {}

  async execute(request: StoreProposalDecisionRequest): Promise<void> {
    const note = request.note.trim();
    if (note.length < PROPOSAL_NOTE_LENGTH.min || note.length > PROPOSAL_NOTE_LENGTH.max) {
      throw new InvalidProposalNoteError();
    }
    const { proposals, stores, clock } = this.ports;
    if (request.decision === 'fusionar') {
      if (!request.mergeInto || !(await stores.exists(request.mergeInto))) {
        throw new MergeTargetNotFoundError();
      }
    }
    const mergeInto =
      request.decision === 'fusionar' && request.mergeInto ? { mergeInto: request.mergeInto } : {};
    const decided = await proposals.decide(
      {
        proposalId: request.proposalId,
        decision: request.decision,
        ...mergeInto,
        note,
        moderatorKey: request.moderatorKey,
        decidedAt: clock.now(),
      },
      [
        createEvent(STORE_PROPOSAL_DECIDED, 1, {
          proposalId: request.proposalId,
          decision: request.decision,
          ...mergeInto,
          note,
        }),
      ],
    );
    if (!decided) throw new StoreProposalNotFoundError();
  }
}
