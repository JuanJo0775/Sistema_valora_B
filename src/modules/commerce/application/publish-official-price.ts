import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/domain-error';
import {
  assertOfficialPriceInRange,
  assertPlausiblePrice,
  assessOfficialPrice,
  type FallbackReference,
} from '../../../domain/price-plausibility';
import { createEvent, type DomainEvent } from '../../../shared/events';
import type { MerchantClaimRepository } from './merchant-claims';
import {
  OFFICIAL_PRICE_HELD,
  OFFICIAL_PRICE_PUBLISHED,
  type OfficialPrice,
  type OfficialPriceRepository,
  type OfficialPriceReview,
  type OfficialPriceStatus,
} from './official-prices';

// ADR-037: lo que Valora sabe del precio de una presentación fuera de esta tienda (ADR-030).
export interface PriceReference {
  of(place: { presentationId: string; establishmentId: string }): Promise<FallbackReference>;
}

export interface PublishOfficialPricePorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  // El catálogo, por la interfaz pública de catalog.
  presentations: { exists(presentationId: string): Promise<boolean> };
  prices: Pick<OfficialPriceRepository, 'save' | 'hold'>;
  // ADR-037: la referencia de ADR-030 (otras tiendas del municipio y SIPSA), de pricing.
  reference: PriceReference;
  // La clave seudónima de la cuenta (EC-08): moderación no decide sobre lo propio.
  reporters: { keyOf(accountId: string): Promise<string> };
  clock: { now(): Date };
}

export interface PublishOfficialPriceRequest {
  accountId: string;
  presentationId: string;
  priceCop: number;
}

// «vigente» ya es el oficial de la tienda; «en_revision» espera la decisión de moderación (ADR-037).
export interface PublishedOfficialPrice extends OfficialPrice {
  status: OfficialPriceStatus;
}

// D2 y D3: solo un comercio verificado publica. La capa HTTP la traduce a 403.
export class MerchantNotVerifiedError extends Error {
  readonly code = 'MERCHANT_NOT_VERIFIED';

  constructor() {
    super('Tu tienda todavía no está verificada: podrás publicar precios cuando se apruebe.');
    this.name = 'MerchantNotVerifiedError';
  }
}

// Regla incumplida (422), con el mismo código que en los reportes.
export class UnknownPresentationError extends DomainError {
  readonly code = 'UNKNOWN_PRESENTATION';

  constructor() {
    super('Esa presentación no está en Valora: propón el producto.');
  }
}

// La tienda de un comercio verificado (D2, D3); si no lo está, no puede trabajar con precios.
export async function verifiedEstablishmentOf(
  claims: Pick<MerchantClaimRepository, 'findByAccount'>,
  accountId: string,
): Promise<string> {
  const claim = await claims.findByAccount(accountId);
  if (claim?.status !== 'verificado') throw new MerchantNotVerifiedError();
  return claim.establishmentId;
}

// ADR-037: el precio que espera a moderación.
export function newReview(
  price: Pick<OfficialPrice, 'establishmentId' | 'presentationId' | 'priceCop'>,
  submittedAt: Date,
): OfficialPriceReview {
  const { establishmentId, presentationId, priceCop } = price;
  return { reviewId: randomUUID(), establishmentId, presentationId, priceCop, submittedAt };
}

// ADR-037: el aviso que lleva ese precio a la cola de moderación (la clave es seudónima, EC-08).
export function heldEvent(review: OfficialPriceReview, reporterKey: string): DomainEvent {
  return createEvent(OFFICIAL_PRICE_HELD, 1, {
    ...review,
    submittedAt: review.submittedAt.toISOString(),
    reporterKey,
  });
}

// RF-016 con la D4 del grill comercial: el comercio publica o cambia el precio oficial de su tienda.
// ADR-037: se compara con la referencia de ADR-030. Dentro de rango se publica; claramente fuera se
// rechaza (422 IMPLAUSIBLE_OFFICIAL_PRICE); sin referencia se acepta pero queda «en_revision».
export class PublishOfficialPrice {
  constructor(private readonly ports: PublishOfficialPricePorts) {}

  async execute(request: PublishOfficialPriceRequest): Promise<PublishedOfficialPrice> {
    assertPlausiblePrice(request.priceCop);
    const { claims, prices, clock, reference, reporters } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, request.accountId);
    if (!(await this.ports.presentations.exists(request.presentationId))) {
      throw new UnknownPresentationError();
    }
    const price: OfficialPrice = {
      establishmentId,
      presentationId: request.presentationId,
      priceCop: request.priceCop,
      confirmedAt: clock.now(),
    };
    const verdict = assessOfficialPrice(
      price.priceCop,
      await reference.of({ presentationId: price.presentationId, establishmentId }),
    );
    if (assertOfficialPriceInRange(price.priceCop, verdict) === 'sin_referencia') {
      const review = newReview(price, price.confirmedAt);
      await prices.hold(review, [heldEvent(review, await reporters.keyOf(request.accountId))]);
      return { ...price, status: 'en_revision' };
    }
    await prices.save(price, [
      createEvent(OFFICIAL_PRICE_PUBLISHED, 1, {
        ...price,
        confirmedAt: price.confirmedAt.toISOString(),
      }),
    ]);
    return { ...price, status: 'vigente' };
  }
}
