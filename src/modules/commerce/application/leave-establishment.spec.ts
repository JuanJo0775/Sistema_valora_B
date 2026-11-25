import type { DomainEvent } from '../../../shared/events';
import { LeaveEstablishment } from './leave-establishment';
import type { MerchantDeparture } from './merchant-departures';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice } from './official-prices';
import type { Promotion } from './promotions';

const now = new Date('2026-11-24T12:00:00Z');
const STORE = 'tienda-esperanza';

const owner: MerchantClaim = {
  accountId: 'cuenta-del-dueno',
  establishmentId: STORE,
  responsibleName: 'Rosa Gómez',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
};
const price = (presentationId: string): OfficialPrice => ({
  establishmentId: STORE,
  presentationId,
  priceCop: 2600,
  confirmedAt: new Date('2026-11-22T15:00:00Z'),
});
const promotion: Promotion = {
  id: 'promo-1',
  establishmentId: STORE,
  presentationId: 'arroz',
  offer: { type: 'descuento_porcentual', percent: 10 },
  conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
  validFrom: '2026-11-22',
  validUntil: '2026-11-30',
  createdAt: new Date('2026-11-22T15:00:00Z'),
};

function setup(claim: MerchantClaim | null = owner, departed = true) {
  const departures: { departure: MerchantDeparture; events: DomainEvent[] }[] = [];
  const leave = new LeaveEstablishment({
    claims: { findByAccount: () => Promise.resolve(claim) },
    prices: { listFor: () => Promise.resolve([price('arroz'), price('aceite')]) },
    promotions: { listFor: () => Promise.resolve([promotion]) },
    departures: {
      depart: (departure, events) => {
        departures.push({ departure, events });
        return Promise.resolve(departed);
      },
    },
    clock: { now: () => now },
  });
  return { leave, departures };
}

// H36: el comercio deja de administrar su tienda sin tocar el resto de la cuenta.
describe('dejar de administrar la tienda (H36)', () => {
  it('retira la solicitud, avisa que el comercio se fue y retira lo publicado, todo junto', async () => {
    const { leave, departures } = setup();

    const result = await leave.execute('cuenta-del-dueno');

    expect(result).toEqual({ status: 'dejada', establishmentId: STORE });
    expect(departures).toHaveLength(1);
    expect(departures[0]?.departure).toEqual({
      accountId: 'cuenta-del-dueno',
      establishmentId: STORE,
      kind: 'dejada',
      departedAt: now,
    });
    expect(departures[0]?.events.map((event) => event.type)).toEqual([
      'MerchantLeft',
      'OfficialPriceWithdrawn',
      'OfficialPriceWithdrawn',
      'PromotionWithdrawn',
    ]);
    expect(departures[0]?.events[0]?.payload).toEqual({
      accountId: 'cuenta-del-dueno',
      establishmentId: STORE,
    });
  });

  it('no publica nada que borre la tienda: sigue en el mapa', async () => {
    const { leave, departures } = setup();

    await leave.execute('cuenta-del-dueno');

    expect(departures[0]?.events.map((event) => event.type)).not.toContain(
      'MerchantEstablishmentDeleted',
    );
  });

  it('es idempotente: sin tienda responde sin_tienda y no cambia nada', async () => {
    const { leave, departures } = setup(null);

    expect(await leave.execute('cuenta-sin-tienda')).toEqual({ status: 'sin_tienda' });
    expect(departures).toEqual([]);
  });

  it('si otra llamada ya la dejó a la vez, responde sin_tienda', async () => {
    const { leave } = setup(owner, false);

    expect(await leave.execute('cuenta-del-dueno')).toEqual({ status: 'sin_tienda' });
  });

  it('una cuenta pre-aprobada deja su solicitud sin cambio de rol (ya es reportante)', async () => {
    const { leave, departures } = setup({ ...owner, status: 'pre_aprobado', verifiedAt: null });

    const result = await leave.execute('cuenta-del-dueno');

    expect(result).toEqual({ status: 'dejada', establishmentId: STORE });
    expect(departures[0]?.events.map((event) => event.type)).not.toContain('MerchantLeft');
  });
});
