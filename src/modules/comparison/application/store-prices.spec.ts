import type { StoreContact } from '../../establishments';
import type { PresentationForPricing } from '../../catalog';
import type { PriceRef, PriceReliability } from '../../reliability';
import type { CurrentPrice } from './current-prices';
import type { OfficialPriceCopy } from './official-price-copies';
import type { PromotionCopy } from './promotion-copies';
import { StorePrices } from './store-prices';

const now = new Date('2026-11-15T14:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const store = {
  id: 'tienda-1',
  name: 'Tienda Don José',
  type: 'barrio' as const,
  address: 'Cra. 14 # 20-10',
  lat: 4.535,
  lng: -75.6811,
  municipality: 'armenia' as const,
};

const presentation = (
  productId: string,
  label: string,
  change: Partial<PresentationForPricing> = {},
): PresentationForPricing => ({
  productId,
  label,
  quantity: 500,
  unit: 'g',
  packCount: 1,
  isFresh: false,
  ...change,
});

const price = (
  presentationId: string,
  priceCop: number,
  change: Partial<CurrentPrice> = {},
): CurrentPrice => ({
  reportId: `reporte-${presentationId}`,
  source: 'comunidad',
  presentationId,
  establishmentId: store.id,
  priceCop,
  observedAt: hoursAgo(2),
  status: 'vigente',
  ...change,
});

function setup(
  prices: CurrentPrice[],
  presentations: Map<string, PresentationForPricing>,
  contact: StoreContact = {},
  officials: OfficialPriceCopy[] = [],
  reports: { reportId: string; priceCop: number; hoursAgo: number }[] = [],
  extras: { verified?: boolean; promotions?: PromotionCopy[] } = {},
) {
  const asked: { refs: PriceRef[]; ttlDays: number }[] = [];
  const storePrices = new StorePrices({
    stores: { find: (id) => Promise.resolve(id === store.id ? store : null) },
    // D5 (#207): el horario y el teléfono que puso el comercio.
    contacts: { of: () => Promise.resolve(contact) },
    presentations: { of: () => Promise.resolve(presentations) },
    prices: { findByEstablishment: () => Promise.resolve(prices) },
    // #218: la copia del precio oficial de la tienda.
    officials: { findByEstablishment: () => Promise.resolve(officials) },
    // H6: si el comercio de la tienda está verificado, y sus promociones.
    merchants: { isVerified: () => Promise.resolve(extras.verified ?? false) },
    promotionCopies: { findByEstablishment: () => Promise.resolve(extras.promotions ?? []) },
    reliability: {
      reportsAt: () =>
        Promise.resolve(
          reports.map(({ hoursAgo: hours, ...report }) => ({
            ...report,
            observedAt: hoursAgo(hours),
            level: 'alta' as const,
          })),
        ),
      of: (refs, ttlDays): Promise<PriceReliability[]> => {
        asked.push({ refs, ttlDays });
        return Promise.resolve(refs.map((ref) => ({ ...ref, level: 'media', confirmations: 1 })));
      },
    },
    clock: { now: () => now },
  });
  return { asked, storePrices };
}

describe('precios vigentes de una tienda (RF-008, grill de la #28)', () => {
  it('cada precio trae su producto, su precio por unidad, su fuente, su vigencia y su confiabilidad, ordenados por producto', async () => {
    const presentations = new Map([
      [
        'leche-1l',
        presentation('leche', 'Leche Colanta · 1 l', { quantity: 1, unit: 'l', isFresh: true }),
      ],
      ['arroz-500g', presentation('arroz', 'Arroz Diana · 500 g')],
    ]);
    const { asked, storePrices } = setup(
      [price('leche-1l', 4800), price('arroz-500g', 2500)],
      presentations,
    );

    const result = await storePrices.of(store.id, { onlyCurrent: false });

    expect(result?.establishment).toEqual(store);
    expect(result?.prices.map((item) => item.productName)).toEqual([
      'Arroz Diana · 500 g',
      'Leche Colanta · 1 l',
    ]);
    expect(result?.prices[0]).toMatchObject({
      productId: 'arroz',
      presentationId: 'arroz-500g',
      reportId: 'reporte-arroz-500g',
      priceCop: 2500,
      source: 'comunidad',
      freshness: 'vigente',
      reliability: 'media',
      confirmations: 1,
      observedAt: hoursAgo(2),
    });
    // 500 g a $2.500 equivale a $500 por 100 g.
    expect(result?.prices[0]?.unitPrice.displayCop).toBe(500);
    expect(result?.prices[0]?.unitPrice.per).toBe('100g');
    // La confiabilidad usa el TTL de la categoría de cada presentación.
    expect(asked.map((call) => call.ttlDays).sort((a, b) => a - b)).toEqual([7, 14]);
  });

  it('un precio en revisión dice en_revision, sin confirmaciones ni evaluación', async () => {
    const presentations = new Map([['arroz-500g', presentation('arroz', 'Arroz Diana · 500 g')]]);
    const { asked, storePrices } = setup(
      [price('arroz-500g', 1200, { status: 'en_revision' })],
      presentations,
    );

    const result = await storePrices.of(store.id, { onlyCurrent: false });

    expect(result?.prices[0]).toMatchObject({ reliability: 'en_revision', confirmations: 0 });
    expect(asked).toEqual([]);
  });

  it('con onlyCurrent quita los desactualizados y los que están en revisión', async () => {
    const presentations = new Map([
      ['arroz-500g', presentation('arroz', 'Arroz Diana · 500 g')],
      ['frijol-500g', presentation('frijol', 'Fríjol · 500 g')],
      ['lenteja-500g', presentation('lenteja', 'Lenteja · 500 g')],
    ]);
    const { storePrices } = setup(
      [
        price('arroz-500g', 2500),
        // 30 días: más de 2 veces el TTL de 14 días.
        price('frijol-500g', 3000, { observedAt: hoursAgo(30 * 24) }),
        price('lenteja-500g', 900, { status: 'en_revision' }),
      ],
      presentations,
    );

    const all = await storePrices.of(store.id, { onlyCurrent: false });
    const current = await storePrices.of(store.id, { onlyCurrent: true });

    expect(all?.prices).toHaveLength(3);
    expect(current?.prices.map((item) => item.presentationId)).toEqual(['arroz-500g']);
  });

  it('una tienda que no existe da null; una sin precios, una lista vacía', async () => {
    const { storePrices } = setup([], new Map());

    await expect(storePrices.of('no-existe', { onlyCurrent: false })).resolves.toBeNull();
    await expect(storePrices.of(store.id, { onlyCurrent: false })).resolves.toEqual({
      establishment: store,
      prices: [],
    });
  });

  // D5 del grill comercial (#207): datos del negocio, nunca de una persona (EC-08).
  it('la ficha trae el horario y el teléfono que puso el comercio', async () => {
    const day = { opens: '07:00', closes: '20:00' };
    const openingHours = {
      lunes: day,
      martes: day,
      miercoles: day,
      jueves: day,
      viernes: day,
      sabado: day,
      domingo: null,
    };
    const { storePrices } = setup([], new Map(), { openingHours, phone: '6067441234' });

    const result = await storePrices.of(store.id, { onlyCurrent: false });

    expect(result?.establishment).toEqual({ ...store, openingHours, phone: '6067441234' });
  });

  // #218: la ficha de la tienda usa la misma regla del precio oficial que la comparación (D1).
  describe('con precio oficial', () => {
    const presentations = new Map([
      ['arroz-500g', presentation('arroz', 'Arroz Diana · 500 g')],
      ['aceite-1l', presentation('aceite', 'Aceite Gourmet · 1 l')],
    ]);
    const official = (presentationId: string, priceCop: number): OfficialPriceCopy => ({
      presentationId,
      establishmentId: store.id,
      priceCop,
      confirmedAt: hoursAgo(5),
      priceChangedAt: hoursAgo(48),
    });

    it('el oficial sale con fuente oficial, sin reporte ni confiabilidad', async () => {
      const { storePrices } = setup([], presentations, {}, [official('aceite-1l', 9000)]);

      const result = await storePrices.of(store.id, { onlyCurrent: false });

      expect(result?.prices).toEqual([
        {
          productId: 'aceite',
          presentationId: 'aceite-1l',
          productName: 'Aceite Gourmet · 1 l',
          priceCop: 9000,
          unitPrice: expect.anything() as unknown,
          source: 'oficial',
          freshness: 'vigente',
          observedAt: hoursAgo(5),
        },
      ]);
    });

    it('con discrepancia corroborada sale la mediana de la comunidad con el oficial al lado', async () => {
      const { storePrices } = setup(
        [],
        presentations,
        {},
        [official('arroz-500g', 2200)],
        [
          { reportId: 'r-1', priceCop: 2700, hoursAgo: 3 },
          { reportId: 'r-2', priceCop: 2600, hoursAgo: 2 },
        ],
      );

      const result = await storePrices.of(store.id, { onlyCurrent: false });

      expect(result?.prices).toEqual([
        expect.objectContaining({
          reportId: 'r-2',
          priceCop: 2600,
          source: 'comunidad',
          discrepancy: {
            officialPriceCop: 2200,
            reportedPriceCop: 2600,
            reports: 2,
            since: hoursAgo(3),
          },
        }),
      ]);
    });
  });
});

describe('ficha pública: comercio verificado y promociones (H6)', () => {
  const presentations = new Map([['arroz-1kg', presentation('arroz', 'Arroz Diana · 1 kg')]]);
  const official: OfficialPriceCopy = {
    presentationId: 'arroz-1kg',
    establishmentId: store.id,
    priceCop: 5200,
    confirmedAt: hoursAgo(2),
    priceChangedAt: hoursAgo(2),
  };
  const promotion = (change: Partial<PromotionCopy> = {}): PromotionCopy => ({
    id: 'promo-1',
    establishmentId: store.id,
    presentationId: 'arroz-1kg',
    offer: { type: 'descuento_porcentual', percent: 10 },
    conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
    validFrom: '2026-11-10',
    validUntil: '2026-11-20',
    ...change,
  });

  it('dice si el comercio de la tienda está verificado', async () => {
    const verified = setup([], presentations, {}, [], [], { verified: true });
    const community = setup([], presentations, {}, [], [], { verified: false });
    expect(
      (await verified.storePrices.of(store.id, { onlyCurrent: false }))?.verifiedMerchant,
    ).toBe(true);
    expect(
      (await community.storePrices.of(store.id, { onlyCurrent: false }))?.verifiedMerchant,
    ).toBe(false);
  });

  it('una promoción activa sale con el «antes» oficial y el precio con la promoción', async () => {
    const { storePrices } = setup([], presentations, {}, [official], [], {
      promotions: [promotion()],
    });
    const result = await storePrices.of(store.id, { onlyCurrent: false });
    expect(result?.promotions).toEqual([
      {
        id: 'promo-1',
        presentationId: 'arroz-1kg',
        productName: 'Arroz Diana · 1 kg',
        offer: { type: 'descuento_porcentual', percent: 10 },
        conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
        validFrom: '2026-11-10',
        validUntil: '2026-11-20',
        officialPriceCop: 5200,
        promotedPriceCop: 4680,
      },
    ]);
  });

  it('una promoción vencida o aún no iniciada no se muestra', async () => {
    const { storePrices } = setup([], presentations, {}, [official], [], {
      promotions: [
        promotion({ id: 'vencida', validUntil: '2026-11-14' }),
        promotion({ id: 'futura', validFrom: '2026-11-16', validUntil: '2026-11-20' }),
      ],
    });
    expect((await storePrices.of(store.id, { onlyCurrent: false }))?.promotions).toEqual([]);
  });

  it('una promoción sin precio oficial vigente no se muestra (queda pausada)', async () => {
    const stale: OfficialPriceCopy = { ...official, confirmedAt: hoursAgo(24 * 30) };
    const { storePrices } = setup([], presentations, {}, [stale], [], {
      promotions: [promotion()],
    });
    expect((await storePrices.of(store.id, { onlyCurrent: false }))?.promotions).toEqual([]);
  });
});
