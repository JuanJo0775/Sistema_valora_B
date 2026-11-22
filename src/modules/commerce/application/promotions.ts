import { freshnessOf, ttlDaysFor } from '../../../domain/freshness';
import {
  type PromotionOffer,
  type PromotionStatus,
  promotedPriceCop,
  promotionStatus,
} from '../../../domain/promotion';
import type { DomainEvent } from '../../../shared/events';

// D6 del grill comercial: condiciones fijas, sin texto libre.
export interface PromotionConditions {
  maxPerCustomer?: number;
  whileStocksLast: boolean;
  paymentMethod: 'cualquiera' | 'efectivo' | 'tarjeta';
}

// RF-017: una promoción de un comercio verificado sobre su precio oficial.
export interface Promotion {
  id: string;
  establishmentId: string;
  presentationId: string;
  offer: PromotionOffer;
  conditions: PromotionConditions;
  // Fechas de Colombia (AAAA-MM-DD), las dos incluidas.
  validFrom: string;
  validUntil: string;
  createdAt: Date;
}

// Lo que ve el comercio: el estado se calcula al leer (D6), con el oficial de hoy.
export interface PromotionView extends Promotion {
  status: PromotionStatus;
  officialPriceCop: number | null;
  promotedPriceCop: number | null;
}

// Puerto hacia el esquema commerce.
export interface PromotionRepository {
  // Con sus eventos, en la misma transacción (ADR-015).
  save(promotion: Promotion, events: DomainEvent[]): Promise<void>;
  // Las de la tienda, la más reciente primero.
  listFor(establishmentId: string): Promise<Promotion[]>;
  findById(promotionId: string): Promise<Promotion | null>;
  // Con sus eventos, en la misma transacción (ADR-015).
  delete(promotionId: string, events: DomainEvent[]): Promise<void>;
}

export const PROMOTION_PUBLISHED = 'PromotionPublished';
export const PROMOTION_WITHDRAWN = 'PromotionWithdrawn';

// D6: el estado y los precios de hoy. Sin oficial (retirado al revocar, B8), queda pausada.
export function promotionView(
  promotion: Promotion,
  official: { priceCop: number; confirmedAt: Date } | null,
  isFresh: boolean,
  now: Date,
): PromotionView {
  const officialFreshness = official
    ? freshnessOf({ observedAt: official.confirmedAt, now, ttlDays: ttlDaysFor(isFresh) })
    : 'desactualizado';
  return {
    ...promotion,
    status: promotionStatus({ ...promotion, now, officialFreshness }),
    officialPriceCop: official?.priceCop ?? null,
    promotedPriceCop: official ? promotedPriceCop(promotion.offer, official.priceCop) : null,
  };
}
