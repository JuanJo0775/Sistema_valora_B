import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim } from './merchant-claims';
import { MerchantNotVerifiedError } from './publish-official-price';
import { ReconfirmOfficialPrices } from './reconfirm-official-prices';

const now = new Date('2026-11-30T10:00:00Z');
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

function setup(claim: MerchantClaim | null = merchant) {
  const reconfirmed: { establishmentId: string; at: Date }[] = [];
  const events: DomainEvent[] = [];
  const reconfirm = new ReconfirmOfficialPrices({
    claims: { findByAccount: () => Promise.resolve(claim) },
    prices: {
      reconfirmAll: (establishmentId, at, published) => {
        reconfirmed.push({ establishmentId, at });
        events.push(...published);
        // La tienda tiene 3 precios oficiales.
        return Promise.resolve(3);
      },
    },
    clock: { now: () => now },
  });
  return { reconfirm, reconfirmed, events };
}

describe('«Todos mis precios siguen igual» (D4 del grill comercial)', () => {
  it('reconfirma de un toque todos los precios de su tienda y avisa con un solo evento', async () => {
    const { reconfirm, reconfirmed, events } = setup();

    await expect(reconfirm.execute('cuenta-de-dona-rosa')).resolves.toEqual({ reconfirmed: 3 });

    expect(reconfirmed).toEqual([{ establishmentId: STORE, at: now }]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'OfficialPricesReconfirmed',
        version: 1,
        payload: { establishmentId: STORE, confirmedAt: now.toISOString() },
      }),
    ]);
  });

  it('sin tienda verificada no reconfirma nada', async () => {
    const { reconfirm, reconfirmed } = setup({
      ...merchant,
      status: 'pre_aprobado',
      verifiedAt: null,
    });

    await expect(reconfirm.execute('cuenta-de-dona-rosa')).rejects.toThrow(
      MerchantNotVerifiedError,
    );
    expect(reconfirmed).toEqual([]);
  });
});
