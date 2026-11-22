import type { MerchantClaim } from './merchant-claims';
import { MerchantProfile } from './merchant-profile';

const claim: MerchantClaim = {
  accountId: 'cuenta-de-dona-rosa',
  establishmentId: 'tienda-esperanza',
  responsibleName: 'Rosa Gómez',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
};

function setup(claims: MerchantClaim[]) {
  return new MerchantProfile({
    claims: {
      findByAccount: (accountId) =>
        Promise.resolve(claims.find((c) => c.accountId === accountId) ?? null),
    },
    establishments: {
      find: (id) =>
        Promise.resolve(
          id === 'tienda-esperanza'
            ? { name: 'Tienda La Esperanza', lat: 4.5339, lng: -75.6811 }
            : null,
        ),
    },
  });
}

describe('perfil del comercio (GET /commerce/me, D3 del grill comercial)', () => {
  it('muestra su tienda y su estado, sin ninguna ubicación', async () => {
    const profile = await setup([claim]).find('cuenta-de-dona-rosa');

    expect(profile).toEqual({
      status: 'verificado',
      establishment: { id: 'tienda-esperanza', name: 'Tienda La Esperanza' },
      responsibleName: 'Rosa Gómez',
      informal: true,
      verifiedAt: claim.verifiedAt,
    });
  });

  it('una cuenta sin tienda registrada no tiene perfil de comercio', async () => {
    expect(await setup([claim]).find('otra-cuenta')).toBeNull();
  });
});
