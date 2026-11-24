import { createEvent } from '../../../shared/events';
import { DomainError } from '../../../domain/domain-error';
import type {
  MerchantCaseRepository,
  MerchantClaimReviews,
  MerchantRevocations,
} from './merchant-cases';
import { MERCHANT_VERIFIED } from './claim-establishment';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPriceRepository } from './official-prices';
import type { PromotionRepository } from './promotions';
import { withdrawalEvents } from './withdrawals';

export interface DecideMerchantCasePorts {
  cases: Pick<MerchantCaseRepository, 'findPending' | 'close'>;
  claims: { findByEstablishment(establishmentId: string): Promise<MerchantClaim | null> };
  prices: Pick<OfficialPriceRepository, 'listFor'>;
  promotions: Pick<PromotionRepository, 'listFor'>;
  revocations: MerchantRevocations;
  // H11: aprobar o rechazar un reclamo pre-aprobado.
  claimReviews: MerchantClaimReviews;
  clock: { now(): Date };
}

export interface MerchantCaseDecisionRequest {
  caseId: string;
  decision: 'revocar' | 'descartar' | 'aprobar' | 'rechazar';
  note: string;
  // Clave seudónima del moderador (EC-08).
  moderatorKey: string;
}

// No existe o ya se decidió: la capa HTTP lo traduce a 404.
export class MerchantCaseNotFoundError extends Error {
  constructor() {
    super('El caso no existe o ya se decidió.');
    this.name = 'MerchantCaseNotFoundError';
  }
}

// La decisión no corresponde al tipo de caso (aprobar y rechazar son del reclamo; revocar y descartar,
// de la denuncia y la disputa). La capa HTTP la traduce a 422.
export class DecisionNotApplicableError extends DomainError {
  readonly code = 'DECISION_NOT_APPLICABLE';

  constructor(kind: string) {
    super(`Esa decisión no corresponde a un caso de tipo ${kind}.`);
  }
}

export const MERCHANT_REVOKED = 'MerchantRevoked';

// D3 del grill comercial: el moderador revoca el comercio (se retira todo al instante y la cuenta
// vuelve a reportante) o descarta el caso. H11: en un reclamo pre-aprobado aprueba (verifica y concede
// el rol) o rechaza.
export class DecideMerchantCase {
  constructor(private readonly ports: DecideMerchantCasePorts) {}

  async execute(request: MerchantCaseDecisionRequest): Promise<void> {
    const { cases, claims, prices, promotions, revocations, clock } = this.ports;
    const merchantCase = await cases.findPending(request.caseId);
    if (!merchantCase) throw new MerchantCaseNotFoundError();
    const isClaim = merchantCase.kind === 'reclamo';
    if (isClaim !== (request.decision === 'aprobar' || request.decision === 'rechazar')) {
      throw new DecisionNotApplicableError(merchantCase.kind);
    }
    const claim = await claims.findByEstablishment(merchantCase.establishmentId);
    if (isClaim && claim?.status === 'pre_aprobado') {
      await this.reviewClaim(request, merchantCase.id, claim);
      return;
    }
    // Descartar, o revocar cuando el comercio ya no existe (otra decisión lo revocó): solo se cierra.
    // Un reclamo cuya solicitud ya no está pre-aprobada también solo se cierra.
    if (request.decision !== 'revocar' || !claim) {
      await cases.close({
        caseId: merchantCase.id,
        status: 'descartado',
        note: request.note,
        moderatorKey: request.moderatorKey,
        decidedAt: clock.now(),
      });
      return;
    }
    const { establishmentId } = merchantCase;
    const { accountId } = claim;
    await revocations.revoke(
      {
        accountId,
        establishmentId,
        reason: request.note,
        moderatorKey: request.moderatorKey,
        revokedAt: clock.now(),
      },
      [
        createEvent(MERCHANT_REVOKED, 1, { accountId, establishmentId }),
        ...(await withdrawalEvents(establishmentId, prices, promotions)),
      ],
    );
  }

  // H11: el moderador aprueba el reclamo (verificado y rol de comercio por MerchantVerified) o lo rechaza.
  private async reviewClaim(
    request: MerchantCaseDecisionRequest,
    caseId: string,
    claim: MerchantClaim,
  ): Promise<void> {
    const { claimReviews, clock } = this.ports;
    const { accountId, establishmentId } = claim;
    const review = {
      caseId,
      accountId,
      establishmentId,
      note: request.note,
      moderatorKey: request.moderatorKey,
      decidedAt: clock.now(),
    };
    if (request.decision === 'rechazar') {
      await claimReviews.reject(review);
      return;
    }
    await claimReviews.approve(review, [
      createEvent(MERCHANT_VERIFIED, 1, { accountId, establishmentId }),
    ]);
  }
}
