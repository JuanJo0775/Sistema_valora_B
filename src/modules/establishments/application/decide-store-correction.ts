import { InvalidProposalNoteError, PROPOSAL_NOTE_LENGTH } from './decide-store-proposal';
import type { StoreCorrectionDecisions } from './store-details';

export interface DecideStoreCorrectionPorts {
  corrections: StoreCorrectionDecisions;
  clock: { now(): Date };
}

export interface StoreCorrectionDecisionRequest {
  correctionId: string;
  decision: 'aprobar' | 'rechazar';
  note: string;
  // Clave seudónima del moderador (EC-08).
  moderatorKey: string;
}

// No existe o ya se decidió: la capa HTTP lo traduce a 404.
export class StoreCorrectionNotFoundError extends Error {
  constructor() {
    super('La corrección no existe o ya se decidió.');
    this.name = 'StoreCorrectionNotFoundError';
  }
}

// D5 del grill comercial: el moderador aprueba (se aplica a la tienda) o rechaza una corrección de
// nombre o ubicación, con motivo como en las propuestas (#27).
export class DecideStoreCorrection {
  constructor(private readonly ports: DecideStoreCorrectionPorts) {}

  async execute(request: StoreCorrectionDecisionRequest): Promise<void> {
    const note = request.note.trim();
    if (note.length < PROPOSAL_NOTE_LENGTH.min || note.length > PROPOSAL_NOTE_LENGTH.max) {
      throw new InvalidProposalNoteError();
    }
    const decided = await this.ports.corrections.decide({
      correctionId: request.correctionId,
      decision: request.decision,
      note,
      moderatorKey: request.moderatorKey,
      decidedAt: this.ports.clock.now(),
    });
    if (!decided) throw new StoreCorrectionNotFoundError();
  }
}
