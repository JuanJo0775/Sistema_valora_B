import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim } from './merchant-claims';
import type { Promotion } from './promotions';
import { PromotionNotFoundError, WithdrawPromotion } from './withdraw-promotion';

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

const promotion = (id: string, establishmentId = STORE): Promotion => ({
  id,
  establishmentId,
  presentationId: 'arroz-500g',
  offer: { type: 'descuento_porcentual', percent: 10 },
  conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
  validFrom: '2026-11-20',
  validUntil: '2026-11-30',
  createdAt: new Date('2026-11-20T15:00:00Z'),
});

function setup(stored: Promotion[]) {
  const promotions = [...stored];
  const events: DomainEvent[] = [];
  const withdraw = new WithdrawPromotion({
    claims: { findByAccount: () => Promise.resolve(merchant) },
    promotions: {
      findById: (id) => Promise.resolve(promotions.find((p) => p.id === id) ?? null),
      delete: (id, published) => {
        promotions.splice(
          promotions.findIndex((p) => p.id === id),
          1,
        );
        events.push(...published);
        return Promise.resolve();
      },
    },
  });
  return { withdraw, promotions, events };
}

describe('retirar una promoción (DELETE /commerce/promotions/{id}, D6)', () => {
  it('el comercio retira la suya y se avisa PromotionWithdrawn', async () => {
    const { withdraw, promotions, events } = setup([promotion('promo-1'), promotion('promo-2')]);

    await withdraw.execute('cuenta-de-dona-rosa', 'promo-1');

    expect(promotions.map((p) => p.id)).toEqual(['promo-2']);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'PromotionWithdrawn',
        version: 1,
        payload: { id: 'promo-1', establishmentId: STORE, presentationId: 'arroz-500g' },
      }),
    ]);
  });

  it.each([
    ['no existe', 'no-existe'],
    ['es de otra tienda', 'promo-ajena'],
  ])('una promoción que %s no se encuentra', async (_case, id) => {
    const { withdraw, promotions } = setup([promotion('promo-ajena', 'otra-tienda')]);

    await expect(withdraw.execute('cuenta-de-dona-rosa', id)).rejects.toThrow(
      PromotionNotFoundError,
    );
    expect(promotions).toHaveLength(1);
  });
});
