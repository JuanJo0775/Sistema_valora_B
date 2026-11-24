import {
  ImplausibleOfficialPriceError,
  ImplausiblePriceError,
} from '../../../domain/price-plausibility';
import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice, OfficialPriceReview } from './official-prices';
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

// Otras tres tiendas del municipio cobran cerca de $2.600: es la referencia de ADR-030.
const PEERS = [2500, 2600, 2700];

// Dobles en memoria detrás de los puertos: solicitudes, catálogo, referencia y precios oficiales.
function setup(claims: MerchantClaim[] = [merchant], peerPricesCop: number[] = PEERS) {
  const prices: OfficialPrice[] = [];
  const reviews: OfficialPriceReview[] = [];
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
      hold: (review, published) => {
        reviews.push(review);
        events.push(...published);
        return Promise.resolve();
      },
    },
    reference: { of: () => Promise.resolve({ peerPricesCop }) },
    reporters: { keyOf: (accountId) => Promise.resolve(`clave-de-${accountId}`) },
    clock: { now: () => now },
  });
  return { publish, prices, reviews, events };
}

const request = (priceCop: number) => ({
  accountId: 'cuenta-de-dona-rosa',
  presentationId: RICE,
  priceCop,
});

describe('publicar un precio oficial (RF-016, D4 del grill comercial)', () => {
  it('un comercio verificado publica el precio de su tienda dentro de rango, confirmado ahora, y avisa OfficialPricePublished', async () => {
    const { publish, prices, reviews, events } = setup();

    const result = await publish.execute(request(2600));

    const price = {
      establishmentId: STORE,
      presentationId: RICE,
      priceCop: 2600,
      confirmedAt: now,
    };
    expect(result).toEqual({ ...price, status: 'vigente' });
    expect(prices).toEqual([price]);
    expect(reviews).toEqual([]);
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

    await expect(publish.execute(request(2600))).rejects.toThrow(MerchantNotVerifiedError);
    expect(prices).toEqual([]);
    expect(events).toEqual([]);
  });

  it('una presentación que no está en el catálogo se rechaza', async () => {
    const { publish, prices } = setup();

    await expect(
      publish.execute({ ...request(2600), presentationId: 'no-existe' }),
    ).rejects.toThrow(UnknownPresentationError);
    expect(prices).toEqual([]);
  });

  // Neutralidad: el oficial cumple el mismo piso y techo absolutos que un reporte (ADR-030).
  it.each([99, 5_000_001])(
    '$%d se rechaza por el mismo piso y techo de los reportes',
    async (priceCop) => {
      const { publish, prices } = setup();

      await expect(publish.execute(request(priceCop))).rejects.toThrow(ImplausiblePriceError);
      expect(prices).toEqual([]);
    },
  );
});

// H19 del informe de la prueba de usuario y ADR-037: el oficial no se salta la detección de anómalos.
describe('plausibilidad del precio oficial (ADR-037)', () => {
  // Mediana 2.600: el rango normal va de $1.040 (40 %) a $6.500 (250 %).
  it.each([300, 1039, 6501, 52_000])(
    '$%d, claramente fuera de rango, se rechaza con el rango de referencia y no se guarda nada',
    async (priceCop) => {
      const { publish, prices, reviews, events } = setup();

      const error: unknown = await publish.execute(request(priceCop)).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ImplausibleOfficialPriceError);
      expect(error).toMatchObject({
        code: 'IMPLAUSIBLE_OFFICIAL_PRICE',
        message: expect.stringContaining(
          'Lo más barato que vemos es $2.500 y lo más caro $2.700',
        ) as unknown,
      });
      expect(prices).toEqual([]);
      expect(reviews).toEqual([]);
      expect(events).toEqual([]);
    },
  );

  it.each([1040, 6500])('$%d, el límite exacto del rango, se publica', async (priceCop) => {
    const { publish, prices } = setup();

    const result = await publish.execute(request(priceCop));

    expect(result.status).toBe('vigente');
    expect(prices).toHaveLength(1);
  });

  it('sin referencia (menos de 3 tiendas y sin SIPSA) se acepta pero queda en revisión: no es oficial', async () => {
    const { publish, prices, reviews, events } = setup([merchant], [2500, 2600]);

    const result = await publish.execute(request(300));

    expect(result).toEqual({
      establishmentId: STORE,
      presentationId: RICE,
      priceCop: 300,
      confirmedAt: now,
      status: 'en_revision',
    });
    expect(prices).toEqual([]);
    expect(reviews).toEqual([
      {
        reviewId: expect.any(String) as unknown,
        establishmentId: STORE,
        presentationId: RICE,
        priceCop: 300,
        submittedAt: now,
      },
    ]);
    // Entra a la cola de moderación con la clave seudónima de la cuenta (EC-08), no con la cuenta.
    expect(events).toEqual([
      expect.objectContaining({
        type: 'OfficialPriceHeld',
        version: 1,
        payload: {
          reviewId: reviews[0]?.reviewId,
          establishmentId: STORE,
          presentationId: RICE,
          priceCop: 300,
          submittedAt: now.toISOString(),
          reporterKey: 'clave-de-cuenta-de-dona-rosa',
        },
      }),
    ]);
  });
});
