import { createEvent } from '../../../shared/events';
import type { MerchantClaimRepository } from './merchant-claims';
import {
  OFFICIAL_PRICE_PUBLISHED,
  type OfficialPrice,
  type OfficialPriceRepository,
} from './official-prices';

export interface PublishOfficialPricePorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  // El catálogo, por la interfaz pública de catalog.
  presentations: { exists(presentationId: string): Promise<boolean> };
  prices: Pick<OfficialPriceRepository, 'save'>;
  clock: { now(): Date };
}

export interface PublishOfficialPriceRequest {
  accountId: string;
  presentationId: string;
  priceCop: number;
}

// D2 y D3: solo un comercio verificado publica. La capa HTTP la traduce a 403.
export class MerchantNotVerifiedError extends Error {
  readonly code = 'MERCHANT_NOT_VERIFIED';

  constructor() {
    super('Tu tienda todavía no está verificada: podrás publicar precios cuando se apruebe.');
    this.name = 'MerchantNotVerifiedError';
  }
}

// RF-016 con la D4 del grill comercial: el comercio publica o cambia el precio oficial de su tienda.
export class PublishOfficialPrice {
  constructor(private readonly ports: PublishOfficialPricePorts) {}

  async execute(request: PublishOfficialPriceRequest): Promise<OfficialPrice> {
    const { claims, prices, clock } = this.ports;
    const claim = await claims.findByAccount(request.accountId);
    if (claim?.status !== 'verificado') throw new MerchantNotVerifiedError();
    const price: OfficialPrice = {
      establishmentId: claim.establishmentId,
      presentationId: request.presentationId,
      priceCop: request.priceCop,
      confirmedAt: clock.now(),
    };
    await prices.save(price, [
      createEvent(OFFICIAL_PRICE_PUBLISHED, 1, {
        ...price,
        confirmedAt: price.confirmedAt.toISOString(),
      }),
    ]);
    return price;
  }
}
