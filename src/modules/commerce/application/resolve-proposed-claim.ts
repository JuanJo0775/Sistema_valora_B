import { createEvent } from '../../../shared/events';
import { MERCHANT_VERIFIED } from './claim-establishment';
import type { ProposedClaimResolutions } from './merchant-claims';

export interface ResolveProposedClaimPorts {
  claims: ProposedClaimResolutions;
  clock: { now(): Date };
}

// La decisión del moderador sobre la tienda propuesta, tal como la avisa establishments.
export interface ProposalDecision {
  proposalId: string;
  decision: 'aprobar' | 'fusionar' | 'rechazar';
  mergeInto?: string;
  note: string;
}

// D2 del grill comercial: al decidirse la tienda propuesta, el comercio pre-aprobado se resuelve solo.
export class ResolveProposedClaim {
  constructor(private readonly ports: ResolveProposedClaimPorts) {}

  async execute(decision: ProposalDecision): Promise<void> {
    const { claims, clock } = this.ports;
    const claim = await claims.pendingFor(decision.proposalId);
    if (!claim) return;
    const { accountId } = claim;
    if (decision.decision === 'rechazar') {
      await claims.reject({
        accountId,
        establishmentId: claim.establishmentId,
        reason: decision.note,
        rejectedAt: clock.now(),
      });
      return;
    }
    // Fusionar: la propuesta era una tienda que ya estaba en el mapa.
    const establishmentId = decision.mergeInto ?? claim.establishmentId;
    if (decision.decision === 'fusionar' && (await claims.ownerOf(establishmentId)) !== null) {
      await claims.reject({
        accountId,
        establishmentId,
        reason: 'La tienda que propusiste ya estaba en el mapa y tiene dueño.',
        rejectedAt: clock.now(),
      });
      return;
    }
    await claims.verify(accountId, establishmentId, clock.now(), [
      createEvent(MERCHANT_VERIFIED, 1, { accountId, establishmentId }),
    ]);
  }
}
