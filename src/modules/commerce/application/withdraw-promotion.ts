import { createEvent } from '../../../shared/events';
import type { MerchantClaimRepository } from './merchant-claims';
import { PROMOTION_WITHDRAWN, type PromotionRepository } from './promotions';
import { verifiedEstablishmentOf } from './publish-official-price';

export interface WithdrawPromotionPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  promotions: Pick<PromotionRepository, 'findById' | 'delete'>;
}

// No existe o es de otra tienda: la capa HTTP lo traduce a 404 (no se dice cuál de las dos).
export class PromotionNotFoundError extends Error {
  constructor() {
    super('La promoción no existe.');
    this.name = 'PromotionNotFoundError';
  }
}

// D6: el comercio retira una promoción suya; comparison deja de mostrarla.
export class WithdrawPromotion {
  constructor(private readonly ports: WithdrawPromotionPorts) {}

  async execute(accountId: string, promotionId: string): Promise<void> {
    const { claims, promotions } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, accountId);
    const promotion = await promotions.findById(promotionId);
    if (promotion?.establishmentId !== establishmentId) throw new PromotionNotFoundError();
    await promotions.delete(promotion.id, [
      createEvent(PROMOTION_WITHDRAWN, 1, {
        id: promotion.id,
        establishmentId,
        presentationId: promotion.presentationId,
      }),
    ]);
  }
}
