import type { StoreProposalRepository } from './store-proposals';

// Puerta de entrada pública (D2 del grill comercial): commerce muestra la tienda propuesta de un
// comercio pre-aprobado mientras espera la decisión del moderador.
export class PendingStoreProposalName {
  constructor(private readonly proposals: Pick<StoreProposalRepository, 'pendingName'>) {}

  find(proposalId: string): Promise<string | null> {
    return this.proposals.pendingName(proposalId);
  }
}
