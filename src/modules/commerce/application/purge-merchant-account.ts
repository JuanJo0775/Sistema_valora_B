import { createEvent, type DomainEvent } from '../../../shared/events';
import { OFFICIAL_PRICE_WITHDRAWN } from './decide-merchant-case';
import type { MerchantClaimRepository } from './merchant-claims';
import type { OfficialPriceRepository } from './official-prices';
import { PROMOTION_WITHDRAWN, type PromotionRepository } from './promotions';

export interface MerchantPurges {
  // En una transacción: borra la solicitud y el historial de la cuenta, y los precios oficiales y las
  // promociones de su tienda (si tenía), con sus eventos.
  purge(accountId: string, establishmentId: string | null, events: DomainEvent[]): Promise<void>;
}

export interface PurgeMerchantAccountPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  prices: Pick<OfficialPriceRepository, 'listFor'>;
  promotions: Pick<PromotionRepository, 'listFor'>;
  purges: MerchantPurges;
}

// ADR-032 con el hallazgo de B7 (#208): al recibir AccountPurged de identity, commerce borra todo lo
// de esa cuenta y retira lo que publicó, como al revocar.
export class PurgeMerchantAccount {
  constructor(private readonly ports: PurgeMerchantAccountPorts) {}

  async execute(accountId: string): Promise<void> {
    const { claims, prices, promotions, purges } = this.ports;
    const claim = await claims.findByAccount(accountId);
    if (!claim) {
      await purges.purge(accountId, null, []);
      return;
    }
    const { establishmentId } = claim;
    const events = [
      ...(await prices.listFor(establishmentId)).map(({ presentationId }) =>
        createEvent(OFFICIAL_PRICE_WITHDRAWN, 1, { establishmentId, presentationId }),
      ),
      ...(await promotions.listFor(establishmentId)).map(({ id, presentationId }) =>
        createEvent(PROMOTION_WITHDRAWN, 1, { id, establishmentId, presentationId }),
      ),
    ];
    await purges.purge(accountId, establishmentId, events);
  }
}
