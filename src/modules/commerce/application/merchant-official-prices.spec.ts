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

const NAMES: Record<string, { productName: string; presentationLabel: string }> = {
  'arroz-500g': { productName: 'Arroz blanco Diana', presentationLabel: '500 g' },
  'tomate-1kg': { productName: 'Tomate chonto', presentationLabel: '1 kg' },
  'aceite-1l': { productName: 'Aceite de girasol Premier', presentationLabel: '1 l' },
};

describe('los precios oficiales del comercio (GET /commerce/prices, D4 y ADR-005)', () => {
  it('cada precio trae su vigencia desde la última confirmación, con el TTL de su categoría', async () => {
    const stored = [price('arroz-500g', 10), price('tomate-1kg', 10), price('papa-1kg', 20)];
    const reviews = [
      {
        reviewId: 'revision-1',
        establishmentId: STORE,
        presentationId: 'aceite-1l',
        priceCop: 8900,
        submittedAt: daysAgo(1),
      },
    ];
    const list = new MerchantOfficialPrices({
      claims: {
        findByAccount: (accountId) =>
          Promise.resolve(accountId === merchant.accountId ? merchant : null),
      },
      prices: {
        listFor: (establishmentId) =>
          Promise.resolve(stored.filter((p) => p.establishmentId === establishmentId)),
        listReviewsFor: () => Promise.resolve(reviews),
      },
      // El arroz no es fresco (14 días); el tomate y la papa sí (7 días).
      presentations: { isFresh: (id) => Promise.resolve(id !== 'arroz-500g') },
      // Del catálogo canónico, no de la lista pública que se actualiza con retraso (H3).
      names: {
        namesOf: (ids) =>
          Promise.resolve(new Map(ids.filter((id) => id in NAMES).map((id) => [id, NAMES[id]!]))),
      },
      clock: { now: () => now },
    });

    const result = await list.execute('cuenta-de-dona-rosa');

    expect(result.items).toEqual([
      { ...stored[0], ...NAMES['arroz-500g'], freshness: 'vigente' },
      { ...stored[1], ...NAMES['tomate-1kg'], freshness: 'por_confirmar' },
      // Sin presentación en el catálogo, un texto neutro y nunca el identificador (H3).
      {
        ...stored[2],
        productName: 'Producto sin nombre',
        presentationLabel: '',
        freshness: 'desactualizado',
      },
    ]);
    // ADR-037: lo que espera a moderación va aparte; todavía no es el oficial.
    expect(result.inReview).toEqual([
      {
        presentationId: 'aceite-1l',
        ...NAMES['aceite-1l'],
        priceCop: 8900,
        submittedAt: daysAgo(1),
        status: 'en_revision',
      },
    ]);
  });
});
