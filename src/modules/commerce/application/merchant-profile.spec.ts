import type { MerchantClaim, MerchantClaimRejection } from './merchant-claims';
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

function setup(claims: MerchantClaim[], rejections: MerchantClaimRejection[] = []) {
  return new MerchantProfile({
    claims: {
      findByAccount: (accountId) =>
        Promise.resolve(claims.find((c) => c.accountId === accountId) ?? null),
      lastRejection: (accountId) =>
        Promise.resolve(rejections.filter((r) => r.accountId === accountId).at(-1) ?? null),
    },
    establishments: {
      find: (id) =>
        Promise.resolve(
          id === 'tienda-esperanza'
            ? { name: 'Tienda La Esperanza', lat: 4.5339, lng: -75.6811 }
            : id === 'propuesta-1'
              ? { name: 'Tienda El Paraíso', lat: 4.4613, lng: -75.6674 }
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

  it('pre-aprobado: muestra la tienda propuesta y lo que se desbloquea al aprobarla', async () => {
    const preApproved: MerchantClaim = {
      ...claim,
      accountId: 'cuenta-de-don-luis',
      establishmentId: 'propuesta-1',
      status: 'pre_aprobado',
      verifiedAt: null,
    };

    const profile = await setup([preApproved]).find('cuenta-de-don-luis');

    expect(profile).toEqual({
      status: 'pre_aprobado',
      establishment: { id: 'propuesta-1', name: 'Tienda El Paraíso' },
      responsibleName: 'Rosa Gómez',
      informal: true,
      verifiedAt: null,
      unlocks: [
        'precios_oficiales',
        'carga_por_archivo',
        'promociones',
        'avisos_de_precio',
        'datos_de_la_tienda',
      ],
    });
  });

  it('rechazada y sin otra tienda: muestra el motivo para que pueda intentarlo de nuevo', async () => {
    const rejectedAt = new Date('2026-11-22T09:00:00Z');
    const rejection: MerchantClaimRejection = {
      accountId: 'cuenta-de-don-luis',
      establishmentId: 'propuesta-1',
      reason: 'No encontramos la tienda en esa dirección',
      rejectedAt,
    };

    const profile = await setup([], [rejection]).find('cuenta-de-don-luis');

    expect(profile).toEqual({
      status: 'rechazado',
      reason: 'No encontramos la tienda en esa dirección',
      rejectedAt,
    });
  });

  // Precisión de D3 (#208): el comercio revocado entiende qué pasó.
  // H15: la nota del moderador es interna (puede nombrar a quien denunció); la cuenta ve un texto estándar.
  it('revocada por un moderador: muestra «revocado» con un mensaje estándar, no la nota interna', async () => {
    const rejectedAt = new Date('2026-11-23T12:00:00Z');
    const revoked = {
      accountId: 'cuenta-de-dona-rosa',
      establishmentId: 'tienda-esperanza',
      reason: 'Confirmado con el dueño real: suplantación',
      rejectedAt,
      outcome: 'revocado' as const,
    };

    const profile = await setup([], [revoked]).find('cuenta-de-dona-rosa');

    expect(profile).toEqual({
      status: 'revocado',
      reason: 'Moderación revocó el registro de esta cuenta para esa tienda.',
      rejectedAt,
    });
    expect(JSON.stringify(profile)).not.toContain('suplantación');
  });
});
