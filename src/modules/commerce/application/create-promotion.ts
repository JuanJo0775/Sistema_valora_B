import { randomUUID } from 'node:crypto';
import { freshnessOf, ttlDaysFor } from '../../../domain/freshness';
import { type PromotionOffer, promotedPriceCop, promotionStatus } from '../../../domain/promotion';
import { createEvent } from '../../../shared/events';
import type { MerchantClaimRepository } from './merchant-claims';
import type { OfficialPriceRepository } from './official-prices';
import {
  PROMOTION_PUBLISHED,
  type Promotion,
  type PromotionConditions,
  type PromotionRepository,
  type PromotionView,
} from './promotions';
import { verifiedEstablishmentOf } from './publish-official-price';

export interface CreatePromotionPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  prices: Pick<OfficialPriceRepository, 'findOne'>;
  // La categoría de la presentación, por la interfaz pública de catalog (ADR-005).
  presentations: { isFresh(presentationId: string): Promise<boolean | null> };
  promotions: Pick<PromotionRepository, 'save'>;
  clock: { now(): Date };
}

export interface CreatePromotionRequest {
  accountId: string;
  presentationId: string;
  offer: PromotionOffer;
  conditions: PromotionConditions;
  validFrom: string;
  validUntil: string;
}

// RF-017 con la D6 del grill comercial: una promoción sobre el precio oficial vigente de su tienda.
export class CreatePromotion {
  constructor(private readonly ports: CreatePromotionPorts) {}

  async execute(request: CreatePromotionRequest): Promise<PromotionView> {
    const { claims, prices, presentations, promotions, clock } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, request.accountId);
    const official = await prices.findOne(establishmentId, request.presentationId);
    const now = clock.now();
    const promotion: Promotion = {
      id: randomUUID(),
      establishmentId,
      presentationId: request.presentationId,
      offer: request.offer,
      conditions: request.conditions,
      validFrom: request.validFrom,
      validUntil: request.validUntil,
      createdAt: now,
    };
    await promotions.save(promotion, [
      createEvent(PROMOTION_PUBLISHED, 1, {
        ...promotion,
        createdAt: promotion.createdAt.toISOString(),
      }),
    ]);
    const officialPriceCop = official?.priceCop ?? 0;
    const officialFreshness = freshnessOf({
      observedAt: official?.confirmedAt ?? now,
      now,
      ttlDays: ttlDaysFor((await presentations.isFresh(request.presentationId)) ?? false),
    });
    return {
      ...promotion,
      status: promotionStatus({ ...promotion, now, officialFreshness }),
      officialPriceCop,
      promotedPriceCop: promotedPriceCop(promotion.offer, officialPriceCop),
    };
  }
}
