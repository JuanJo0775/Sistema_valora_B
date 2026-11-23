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

const ALREADY_OWNED = 'La tienda que propusiste ya estaba en el mapa y tiene dueño.';

// D2 del grill comercial: al decidirse la tienda propuesta, el comercio pre-aprobado se resuelve solo.
export class ResolveProposedClaim {
  constructor(private readonly ports: ResolveProposedClaimPorts) {}

  async execute(decision: ProposalDecision): Promise<void> {
    const { claims, clock } = this.ports;
    const claim = await claims.pendingFor(decision.proposalId);
    if (!claim) return;
    if (decision.decision === 'rechazar') {
      await this.close(claim.accountId, claim.establishmentId, decision.note);
      return;
    }
    // Fusionar: la propuesta era una tienda que ya estaba en el mapa.
    const establishmentId = decision.mergeInto ?? claim.establishmentId;
    if (decision.decision === 'fusionar' && (await claims.ownerOf(establishmentId)) !== null) {
      await this.close(claim.accountId, establishmentId, ALREADY_OWNED);
      return;
    }
    const { accountId } = claim;
    await claims.verify(accountId, establishmentId, clock.now(), [
      createEvent(MERCHANT_VERIFIED, 1, { accountId, establishmentId }),
    ]);
  }

  // La solicitud sale de las activas (la cuenta puede registrar otra tienda) y queda el motivo.
  private async close(accountId: string, establishmentId: string, reason: string): Promise<void> {
    const { claims, clock } = this.ports;
    await claims.reject({ accountId, establishmentId, reason, rejectedAt: clock.now() });
  }
}
