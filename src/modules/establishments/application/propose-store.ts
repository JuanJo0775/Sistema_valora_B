import { randomUUID } from 'node:crypto';
import type { EstablishmentType } from './establishment-repository';
import type { StoreProposalRepository } from './store-proposals';

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
    await this.ports.proposals.save({
      id,
      name: request.name.trim(),
      type: request.type,
      ...(address ? { address } : {}),
      lat: request.lat,
      lng: request.lng,
      proposerKey: request.proposerKey,
      createdAt: this.ports.clock.now(),
    });
    return { id, status: 'pendiente' };
  }
}
