import type { MerchantClaim } from './merchant-claims';
import { MerchantOfficialPrices } from './merchant-official-prices';
import type { OfficialPrice } from './official-prices';

const now = new Date('2026-11-30T10:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
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
  verifiedAt: daysAgo(20),
};

const price = (presentationId: string, confirmedDaysAgo: number): OfficialPrice => ({
  establishmentId: STORE,
  presentationId,
  priceCop: 3000,
  confirmedAt: daysAgo(confirmedDaysAgo),
});

describe('los precios oficiales del comercio (GET /commerce/prices, D4 y ADR-005)', () => {
  it('cada precio trae su vigencia desde la última confirmación, con el TTL de su categoría', async () => {
    const stored = [price('arroz-500g', 10), price('tomate-1kg', 10), price('papa-1kg', 20)];
    const list = new MerchantOfficialPrices({
      claims: {
        findByAccount: (accountId) =>
          Promise.resolve(accountId === merchant.accountId ? merchant : null),
      },
      prices: {
        listFor: (establishmentId) =>
          Promise.resolve(stored.filter((p) => p.establishmentId === establishmentId)),
      },
      // El arroz no es fresco (14 días); el tomate y la papa sí (7 días).
      presentations: { isFresh: (id) => Promise.resolve(id !== 'arroz-500g') },
      clock: { now: () => now },
    });

    const result = await list.execute('cuenta-de-dona-rosa');

    expect(result).toEqual([
      { ...stored[0], freshness: 'vigente' },
      { ...stored[1], freshness: 'por_confirmar' },
      { ...stored[2], freshness: 'desactualizado' },
    ]);
  });
});
