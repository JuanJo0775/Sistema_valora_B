import { createEvent } from '../../../shared/events';
import type { MerchantCaseRepository, MerchantRevocations } from './merchant-cases';
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
  clock: { now(): Date };
}

export interface MerchantCaseDecisionRequest {
  caseId: string;
  decision: 'revocar' | 'descartar';
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

export const MERCHANT_REVOKED = 'MerchantRevoked';

// D3 del grill comercial: el moderador revoca el comercio (se retira todo al instante y la cuenta
// vuelve a reportante) o descarta el caso.
export class DecideMerchantCase {
  constructor(private readonly ports: DecideMerchantCasePorts) {}

  async execute(request: MerchantCaseDecisionRequest): Promise<void> {
    const { cases, claims, prices, promotions, revocations, clock } = this.ports;
    const merchantCase = await cases.findPending(request.caseId);
    if (!merchantCase) throw new MerchantCaseNotFoundError();
    if (request.decision === 'descartar') {
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
    const claim = await claims.findByEstablishment(establishmentId);
    if (!claim) return;
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
}
