import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/domain-error';
import { freshnessOf, ttlDaysFor } from '../../../domain/freshness';
import {
  assertValidDates,
  assertValidOffer,
  type PromotionOffer,
  promotedPriceCop,
  promotionStatus,
} from '../../../domain/promotion';
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

// D6: sin un oficial vigente no hay promoción (422).
export class OfficialPriceRequiredError extends DomainError {
  readonly code = 'OFFICIAL_PRICE_REQUIRED';

  constructor() {
    super(
      'Para publicar una promoción, primero publica o reconfirma el precio oficial del producto.',
    );
  }
}

// RF-017 con la D6 del grill comercial: una promoción sobre el precio oficial vigente de su tienda.
export class CreatePromotion {
  constructor(private readonly ports: CreatePromotionPorts) {}

  async execute(request: CreatePromotionRequest): Promise<PromotionView> {
    const { claims, prices, presentations, promotions, clock } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, request.accountId);
    const now = clock.now();
    const official = await prices.findOne(establishmentId, request.presentationId);
    const isFresh = (await presentations.isFresh(request.presentationId)) ?? false;
    const officialFreshness =
      official &&
      freshnessOf({ observedAt: official.confirmedAt, now, ttlDays: ttlDaysFor(isFresh) });
    if (!official || officialFreshness !== 'vigente') throw new OfficialPriceRequiredError();
    assertValidOffer(request.offer, official.priceCop);
    assertValidDates({ ...request, now });
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
    return {
      ...promotion,
      status: promotionStatus({ ...promotion, now, officialFreshness }),
      officialPriceCop: official.priceCop,
      promotedPriceCop: promotedPriceCop(promotion.offer, official.priceCop),
    };
  }
}
