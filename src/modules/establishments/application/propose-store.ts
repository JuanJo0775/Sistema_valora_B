import { randomUUID } from 'node:crypto';
import { createEvent } from '../../../shared/events';
import type { Municipality } from '../../../domain/municipality';
import type { EstablishmentType } from './establishment-repository';
import type { StoreProposalRepository } from './store-proposals';

// #260: moderación se entera por el outbox de que hay una propuesta nueva. Solo lleva el id (EC-08).
export const STORE_PROPOSED = 'StoreProposed';

export interface ProposeStorePorts {
  proposals: Pick<StoreProposalRepository, 'save'>;
  clock: { now(): Date };
}

export interface StoreProposalRequest {
  name: string;
  type: EstablishmentType;
  address?: string;
  lat: number;
  lng: number;
  // Grill de la #106.
  municipality: Municipality;
  // Clave seudónima de quien propone (EC-08).
  proposerKey: string;
}

// RF-005 (grill de la #27, pregunta 1): un reportante propone una tienda; queda pendiente y no
// aparece en el mapa hasta que un moderador la aprueba (RN7).
export class ProposeStore {
  constructor(private readonly ports: ProposeStorePorts) {}

  async execute(request: StoreProposalRequest): Promise<{ id: string; status: 'pendiente' }> {
    const id = randomUUID();
    const address = request.address?.trim();
    await this.ports.proposals.save(
      {
        id,
        name: request.name.trim(),
        type: request.type,
        ...(address ? { address } : {}),
        lat: request.lat,
        lng: request.lng,
        municipality: request.municipality,
        proposerKey: request.proposerKey,
        createdAt: this.ports.clock.now(),
      },
      [createEvent(STORE_PROPOSED, 1, { proposalId: id })],
    );
    return { id, status: 'pendiente' };
  }
}
