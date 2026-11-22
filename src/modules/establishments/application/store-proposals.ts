import type { DomainEvent } from '../../../shared/events';
import type { Municipality } from '../../../domain/municipality';
import type { EstablishmentType } from './establishment-repository';

// Grill de la #27, pregunta 1: una tienda que propone un reportante, pendiente de moderación (RN7).
export interface NewStoreProposal {
  id: string;
  name: string;
  type: EstablishmentType;
  address?: string;
  // La ubicación de la tienda propuesta, nunca la de quien la propone (RN4).
  lat: number;
  lng: number;
  // Clave seudónima de quien la propone (EC-08): nunca sale en respuestas.
  // Grill de la #106: municipio del Quindío donde está la tienda.
  municipality: Municipality;
  proposerKey: string;
  createdAt: Date;
}

export type StoreProposalDecision = 'aprobar' | 'fusionar' | 'rechazar';

export interface StoreProposalDecisionRecord {
  proposalId: string;
  decision: StoreProposalDecision;
  // Solo con fusionar: la tienda existente que ya representa a la propuesta.
  mergeInto?: string;
  note: string;
  moderatorKey: string;
  decidedAt: Date;
}

export interface StoreProposalRepository {
  save(proposal: NewStoreProposal): Promise<void>;
  // Las pendientes, la más antigua primero.
  pending(): Promise<NewStoreProposal[]>;
  // Aprobar crea la tienda con el id de la propuesta, en la misma transacción. false si la propuesta
  // no existe o ya se decidió.
  // Los eventos se guardan con la decisión (ADR-015) y solo si se decidió.
  decide(record: StoreProposalDecisionRecord, events: DomainEvent[]): Promise<boolean>;
  // El nombre de una propuesta pendiente, o null (D2 del grill comercial: el perfil pre-aprobado).
  pendingName(proposalId: string): Promise<string | null>;
}

export const STORE_PROPOSAL_REPOSITORY = Symbol('STORE_PROPOSAL_REPOSITORY');
