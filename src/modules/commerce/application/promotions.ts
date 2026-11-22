import type { PromotionOffer, PromotionStatus } from '../../../domain/promotion';
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
}

export const PROMOTION_PUBLISHED = 'PromotionPublished';
