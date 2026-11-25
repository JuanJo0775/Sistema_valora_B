import type { MerchantClaim } from './merchant-claims';
import { MerchantPromotions } from './merchant-promotions';
import type { OfficialPrice } from './official-prices';
import type { Promotion } from './promotions';

// 22 de noviembre de 2026, 10:00 a. m. en Colombia.
const now = new Date('2026-11-22T15:00:00Z');
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
  verifiedAt: new Date('2026-11-01T15:00:00Z'),
};

const promotion = (presentationId: string, validFrom: string, validUntil: string): Promotion => ({
  id: `promo-${presentationId}`,
  establishmentId: STORE,
  presentationId,
  offer: { type: 'descuento_porcentual', percent: 10 },
  conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
  validFrom,
  validUntil,
  createdAt: new Date('2026-11-10T15:00:00Z'),
});

const official = (presentationId: string, confirmedAt: string): OfficialPrice => ({
  establishmentId: STORE,
  presentationId,
  priceCop: 3000,
  confirmedAt: new Date(confirmedAt),
});

const namesAsked: string[][] = [];

function setup(promotions: Promotion[], officials: OfficialPrice[]) {
  return new MerchantPromotions({
    claims: { findByAccount: () => Promise.resolve(merchant) },
    promotions: {
      listFor: (establishmentId) =>
        Promise.resolve(promotions.filter((p) => p.establishmentId === establishmentId)),
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
    names: {
      namesOf: (ids) => {
        namesAsked.push(ids);
        return Promise.resolve(
          new Map(
            ids
              .filter((id) => id !== 'cafe')
              .map((id) => [id, { productName: `Producto ${id}`, presentationLabel: '1 kg' }]),
          ),
        );
      },
    },
    clock: { now: () => now },
  });
}

describe('las promociones del comercio (GET /commerce/promotions, D6)', () => {
  it('cada una con su estado calculado hoy: activa, pausada, vencida o programada', async () => {
    const list = setup(
      [
        promotion('arroz', '2026-11-20', '2026-11-30'),
        promotion('aceite', '2026-11-20', '2026-11-30'),
        promotion('panela', '2026-11-01', '2026-11-15'),
        promotion('cafe', '2026-11-28', '2026-11-29'),
      ],
      [
        official('arroz', '2026-11-21T15:00:00Z'),
        // Confirmado hace 20 días: «por confirmar», la promoción se pausa sola.
        official('aceite', '2026-11-02T15:00:00Z'),
        official('panela', '2026-11-21T15:00:00Z'),
        official('cafe', '2026-11-21T15:00:00Z'),
      ],
    );

    const result = await list.execute('cuenta-de-dona-rosa');

    expect(result.map((p) => [p.presentationId, p.status, p.promotedPriceCop])).toEqual([
      ['arroz', 'activa', 2700],
      ['aceite', 'pausada', 2700],
      ['panela', 'vencida', 2700],
      ['cafe', 'programada', 2700],
    ]);
  });

  it('trae el nombre y la etiqueta de cada presentación en una sola consulta al catálogo (H3)', async () => {
    namesAsked.length = 0;
    const list = setup(
      [
        promotion('arroz', '2026-11-20', '2026-11-30'),
        promotion('cafe', '2026-11-20', '2026-11-30'),
      ],
      [official('arroz', '2026-11-21T15:00:00Z'), official('cafe', '2026-11-21T15:00:00Z')],
    );

    const result = await list.execute('cuenta-de-dona-rosa');

    expect(namesAsked).toEqual([['arroz', 'cafe']]);
    expect(result.map((p) => [p.productName, p.presentationLabel])).toEqual([
      ['Producto arroz', '1 kg'],
      ['Producto sin nombre', ''],
    ]);
  });
});
