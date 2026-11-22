import type { MerchantClaim } from './merchant-claims';
import { MerchantNotVerifiedError } from './publish-official-price';
import { type StoreDetailsUpdate, UpdateMyEstablishment } from './update-my-establishment';

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

function setup(claim: MerchantClaim | null = merchant) {
  const asked: { establishmentId: string; accountId: string; update: StoreDetailsUpdate }[] = [];
  const update = new UpdateMyEstablishment({
    claims: { findByAccount: () => Promise.resolve(claim) },
    // La interfaz pública de establishments: aplica al instante o deja en revisión (D5).
    stores: {
      update: (establishmentId, accountId, change) => {
        asked.push({ establishmentId, accountId, update: change });
        return Promise.resolve({ applied: ['phone'], inReview: ['location'] });
      },
    },
  });
  return { update, asked };
}

describe('el comercio corrige los datos de su tienda (PATCH /commerce/establishment, D5)', () => {
  it('pide el cambio para SU tienda y responde qué se aplicó y qué quedó en revisión', async () => {
    const { update, asked } = setup();
    const change = { phone: '6067441234', location: { lat: 4.534, lng: -75.6812 } };

    const result = await update.execute('cuenta-de-dona-rosa', change);

    expect(result).toEqual({ applied: ['phone'], inReview: ['location'] });
    expect(asked).toEqual([
      { establishmentId: STORE, accountId: 'cuenta-de-dona-rosa', update: change },
    ]);
  });

  it('sin tienda verificada no cambia nada', async () => {
    const { update, asked } = setup({ ...merchant, status: 'pre_aprobado', verifiedAt: null });

    await expect(update.execute('cuenta-de-dona-rosa', { phone: '6067441234' })).rejects.toThrow(
      MerchantNotVerifiedError,
    );
    expect(asked).toEqual([]);
  });
});
