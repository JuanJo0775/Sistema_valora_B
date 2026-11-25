import { createEvent, type DomainEvent } from '../../../shared/events';
import type { MerchantClaim, MerchantClaimRepository } from './merchant-claims';
import type { OfficialPriceRepository } from './official-prices';
import type { PromotionRepository } from './promotions';
import { withdrawalEvents } from './withdrawals';

// H36 (ADR-040): identity lo recibe y la cuenta vuelve a reportante. Solo se publica el nombre.
export const MERCHANT_LEFT = 'MerchantLeft';

export interface MerchantDeparture {
  accountId: string;
  establishmentId: string;
  // dejada: la tienda sigue en el mapa sin dueño; eliminada: además se retira.
  kind: 'dejada' | 'eliminada';
  departedAt: Date;
}

export interface MerchantDepartures {
  // En una transacción: borra la solicitud (sin historial de revocación, así puede volver a
  // reclamar), retira lo publicado, cierra los casos abiertos de la tienda y guarda los eventos.
  // false, sin cambios ni eventos, si la cuenta ya no tenía esa solicitud.
  depart(departure: MerchantDeparture, events: DomainEvent[]): Promise<boolean>;
}

export interface MerchantDeparturePorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  prices: Pick<OfficialPriceRepository, 'listFor'>;
  promotions: Pick<PromotionRepository, 'listFor'>;
  departures: MerchantDepartures;
  clock: { now(): Date };
}

// La salida de una cuenta de su tienda, común a dejarla y a eliminarla. Solo un comercio verificado
// cambia de rol: la cuenta pre-aprobada ya es reportante.
export async function departFrom(
  ports: MerchantDeparturePorts,
  claim: MerchantClaim,
  kind: MerchantDeparture['kind'],
  extraEvents: DomainEvent[] = [],
): Promise<boolean> {
  const { prices, promotions, departures, clock } = ports;
  const { accountId, establishmentId } = claim;
  const left =
    claim.status === 'verificado'
      ? [createEvent(MERCHANT_LEFT, 1, { accountId, establishmentId })]
      : [];
  return departures.depart({ accountId, establishmentId, kind, departedAt: clock.now() }, [
    ...left,
    ...extraEvents,
    ...(await withdrawalEvents(establishmentId, prices, promotions)),
  ]);
}
