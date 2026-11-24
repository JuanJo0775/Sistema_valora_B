import { ImplausibleOfficialPriceError } from '../../../domain/price-plausibility';
import { InvalidPromotionError } from '../../../domain/promotion';
import type { DomainEvent } from '../../../shared/events';
import {
  CreatePromotion,
  type CreatePromotionRequest,
  OfficialPriceRequiredError,
} from './create-promotion';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice } from './official-prices';
import type { Promotion } from './promotions';

// 22 de noviembre de 2026, 10:00 a. m. en Colombia.
const now = new Date('2026-11-22T15:00:00Z');
const STORE = 'tienda-esperanza';
const RICE = 'arroz-500g';

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

// El oficial del arroz, confirmado ayer: vigente (el arroz no es fresco, 14 días).
const official: OfficialPrice = {
  establishmentId: STORE,
  presentationId: RICE,
  priceCop: 2600,
  confirmedAt: new Date('2026-11-21T15:00:00Z'),
};

function setup(officials: OfficialPrice[] = [official], peerPricesCop = [2500, 2600, 2700]) {
  const saved: Promotion[] = [];
  const events: DomainEvent[] = [];
  const create = new CreatePromotion({
    claims: {
      findByAccount: (accountId) =>
        Promise.resolve(accountId === merchant.accountId ? merchant : null),
    },
    prices: {
      findOne: (establishmentId, presentationId) =>
        Promise.resolve(
          officials.find(
            (p) => p.establishmentId === establishmentId && p.presentationId === presentationId,
          ) ?? null,
        ),
    },
    presentations: { isFresh: () => Promise.resolve(false) },
    promotions: {
      save: (promotion, published) => {
        saved.push(promotion);
        events.push(...published);
        return Promise.resolve();
      },
    },
    reference: { of: () => Promise.resolve({ peerPricesCop }) },
    clock: { now: () => now },
  });
  return { create, saved, events };
}

const request = (overrides: Partial<CreatePromotionRequest> = {}): CreatePromotionRequest => ({
  accountId: 'cuenta-de-dona-rosa',
  presentationId: RICE,
  offer: { type: 'descuento_porcentual', percent: 20 },
  conditions: { maxPerCustomer: 2, whileStocksLast: true, paymentMethod: 'efectivo' },
  validFrom: '2026-11-22',
  validUntil: '2026-11-30',
  ...overrides,
});

describe('publicar una promoción (RF-017, D6 del grill comercial)', () => {
  it('sobre su oficial vigente: queda activa, con su precio y el aviso PromotionPublished', async () => {
    const { create, saved, events } = setup();

    const result = await create.execute(request());

    const promotion = {
      id: expect.any(String) as unknown,
      establishmentId: STORE,
      presentationId: RICE,
      offer: { type: 'descuento_porcentual', percent: 20 },
      conditions: { maxPerCustomer: 2, whileStocksLast: true, paymentMethod: 'efectivo' },
      validFrom: '2026-11-22',
      validUntil: '2026-11-30',
      createdAt: now,
    };
    expect(saved).toEqual([promotion]);
    expect(result).toEqual({
      ...promotion,
      status: 'activa',
      officialPriceCop: 2600,
      promotedPriceCop: 2080,
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'PromotionPublished',
        version: 1,
        payload: { ...promotion, id: saved[0]?.id, createdAt: now.toISOString() },
      }),
    ]);
  });

  // D6 y EC-06: el «antes» siempre es un precio real y reciente.
  it.each([
    ['sin precio oficial', []],
    // Confirmado hace 20 días: con 14 de TTL está «por confirmar».
    [
      'con el oficial por confirmar',
      [{ ...official, confirmedAt: new Date('2026-11-02T15:00:00Z') }],
    ],
  ] as [string, OfficialPrice[]][])('%s no se publica', async (_case, officials) => {
    const { create, saved, events } = setup(officials);

    await expect(create.execute(request())).rejects.toThrow(OfficialPriceRequiredError);
    expect(saved).toEqual([]);
    expect(events).toEqual([]);
  });

  it.each([
    [
      'un precio especial que no baja el oficial',
      { offer: { type: 'precio_especial', specialPriceCop: 2600 } },
    ],
    ['más de 30 días', { validUntil: '2026-12-31' }],
  ] as [string, Partial<CreatePromotionRequest>][])('%s no se publica', async (_case, change) => {
    const { create, saved } = setup();

    await expect(create.execute(request(change))).rejects.toThrow(InvalidPromotionError);
    expect(saved).toEqual([]);
  });

  // ADR-037: el precio que deja la promoción no puede quedar por debajo de lowRatio (40 %) de la
  // mediana de otras tiendas (aquí 2.600, así que el piso es $1.040).
  describe('plausibilidad del precio resultante (ADR-037)', () => {
    it.each([
      ['un precio especial de $1.039', { type: 'precio_especial', specialPriceCop: 1039 }],
      ['un descuento del 90 %', { type: 'descuento_porcentual', percent: 90 }],
      ['un 1 por 3', { type: 'pague_x_lleve_y', payX: 1, takeY: 3 }],
    ] as [string, CreatePromotionRequest['offer']][])(
      '%s se rechaza con 422',
      async (_case, offer) => {
        const { create, saved, events } = setup();

        const error: unknown = await create.execute(request({ offer })).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ImplausibleOfficialPriceError);
        expect(error).toMatchObject({
          code: 'IMPLAUSIBLE_OFFICIAL_PRICE',
          message: expect.stringContaining('lo más barato que vemos es $2.500') as unknown,
        });
        expect(saved).toEqual([]);
        expect(events).toEqual([]);
      },
    );

    it.each([
      [
        'un precio especial de $1.040, el límite exacto',
        { type: 'precio_especial', specialPriceCop: 1040 },
      ],
      ['un descuento del 60 %', { type: 'descuento_porcentual', percent: 60 }],
    ] as [string, CreatePromotionRequest['offer']][])('%s se publica', async (_case, offer) => {
      const { create, saved } = setup();

      await create.execute(request({ offer }));

      expect(saved).toHaveLength(1);
    });

    it('sin referencia (menos de 3 tiendas y sin SIPSA) no frena la promoción', async () => {
      const { create, saved } = setup([official], []);

      await create.execute(request({ offer: { type: 'descuento_porcentual', percent: 90 } }));

      expect(saved).toHaveLength(1);
    });
  });
});
