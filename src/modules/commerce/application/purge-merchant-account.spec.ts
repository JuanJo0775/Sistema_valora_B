import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice } from './official-prices';
import { PurgeMerchantAccount } from './purge-merchant-account';

const STORE = 'tienda-esperanza';

const merchant: MerchantClaim = {
  accountId: 'cuenta-de-dona-rosa',
  establishmentId: STORE,
  responsibleName: 'Rosa Gómez',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
};
const price: OfficialPrice = {
  establishmentId: STORE,
  presentationId: 'arroz',
  priceCop: 2600,
  confirmedAt: new Date('2026-11-22T15:00:00Z'),
};

function setup(claim: MerchantClaim | null) {
  const purged: { accountId: string; establishmentId: string | null; events: DomainEvent[] }[] = [];
  const purge = new PurgeMerchantAccount({
    claims: { findByAccount: () => Promise.resolve(claim) },
    prices: { listFor: () => Promise.resolve([price]) },
    promotions: { listFor: () => Promise.resolve([]) },
    purges: {
      purge: (accountId, establishmentId, events) => {
        purged.push({ accountId, establishmentId, events });
        return Promise.resolve();
      },
    },
  });
  return { purge, purged };
}

// ADR-032 con el hallazgo de B7 (#208): la cuenta se borra por completo, también en commerce.
describe('borrar la cuenta de un comercio (AccountPurged)', () => {
  it('retira sus precios y promociones y borra su solicitud y su historial', async () => {
    const { purge, purged } = setup(merchant);

    await purge.execute('cuenta-de-dona-rosa');

    expect(purged).toHaveLength(1);
    expect(purged[0]?.accountId).toBe('cuenta-de-dona-rosa');
    expect(purged[0]?.establishmentId).toBe(STORE);
    expect(purged[0]?.events.map((event) => [event.type, event.payload])).toEqual([
      ['OfficialPriceWithdrawn', { establishmentId: STORE, presentationId: 'arroz' }],
    ]);
  });

  it('una cuenta sin tienda activa igual borra su historial, sin eventos', async () => {
    const { purge, purged } = setup(null);

    await purge.execute('cuenta-de-ana');

    expect(purged).toEqual([{ accountId: 'cuenta-de-ana', establishmentId: null, events: [] }]);
  });
});
