import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice } from './official-prices';
import {
  MerchantNotVerifiedError,
  PublishOfficialPrice,
  UnknownPresentationError,
} from './publish-official-price';

const now = new Date('2026-11-22T10:00:00Z');
const STORE = 'tienda-esperanza';
const RICE = 'arroz-diana-500g';

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

// Dobles en memoria detrás de los puertos: solicitudes, catálogo y precios oficiales.
function setup(claims: MerchantClaim[] = [merchant]) {
  const prices: OfficialPrice[] = [];
  const events: DomainEvent[] = [];
  const publish = new PublishOfficialPrice({
    claims: {
      findByAccount: (accountId) =>
        Promise.resolve(claims.find((c) => c.accountId === accountId) ?? null),
    },
    presentations: { exists: (id) => Promise.resolve(id === RICE) },
    prices: {
      save: (price, published) => {
        const index = prices.findIndex(
          (p) =>
            p.establishmentId === price.establishmentId &&
            p.presentationId === price.presentationId,
        );
        if (index === -1) prices.push(price);
        else prices[index] = price;
        events.push(...published);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { publish, prices, events };
}

describe('publicar un precio oficial (RF-016, D4 del grill comercial)', () => {
  it('un comercio verificado publica el precio de su tienda, confirmado ahora, y avisa OfficialPricePublished', async () => {
    const { publish, prices, events } = setup();

    const result = await publish.execute({
      accountId: 'cuenta-de-dona-rosa',
      presentationId: RICE,
      priceCop: 2600,
    });

    const price = {
      establishmentId: STORE,
      presentationId: RICE,
      priceCop: 2600,
      confirmedAt: now,
    };
    expect(result).toEqual(price);
    expect(prices).toEqual([price]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'OfficialPricePublished',
        version: 1,
        payload: { ...price, confirmedAt: now.toISOString() },
      }),
    ]);
  });

  it.each([
    ['pre-aprobado', [{ ...merchant, status: 'pre_aprobado', verifiedAt: null }]],
    ['sin tienda', []],
  ] as [string, MerchantClaim[]][])('%s no publica precios oficiales', async (_case, claims) => {
    const { publish, prices, events } = setup(claims);

    await expect(
      publish.execute({ accountId: 'cuenta-de-dona-rosa', presentationId: RICE, priceCop: 2600 }),
    ).rejects.toThrow(MerchantNotVerifiedError);
    expect(prices).toEqual([]);
    expect(events).toEqual([]);
  });

  it('una presentación que no está en el catálogo se rechaza', async () => {
    const { publish, prices } = setup();

    await expect(
      publish.execute({
        accountId: 'cuenta-de-dona-rosa',
        presentationId: 'no-existe',
        priceCop: 2600,
      }),
    ).rejects.toThrow(UnknownPresentationError);
    expect(prices).toEqual([]);
  });
});
