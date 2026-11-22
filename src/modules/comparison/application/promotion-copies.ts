import type { PromotionOffer } from '../../../domain/promotion';

// D6 del grill comercial (#206): las condiciones fijas de una promoción, sin texto libre.
export interface PromotionConditionsCopy {
  maxPerCustomer?: number;
  whileStocksLast: boolean;
  paymentMethod: 'cualquiera' | 'efectivo' | 'tarjeta';
}

// La copia de una promoción que comparison guarda con los eventos de commerce.
export interface PromotionCopy {
  id: string;
  establishmentId: string;
  presentationId: string;
  offer: PromotionOffer;
  conditions: PromotionConditionsCopy;
  // Fechas de Colombia, las dos incluidas.
  validFrom: string;
  validUntil: string;
}

// Puerto hacia la tabla propia del módulo.
export interface PromotionCopies {
  findByPresentations(presentationIds: string[]): Promise<PromotionCopy[]>;
}
