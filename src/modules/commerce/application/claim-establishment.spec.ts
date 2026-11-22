import { ClaimEstablishment, type ClaimRequest, NotAtEstablishmentError } from './claim-establishment';
import type { MerchantClaim } from './merchant-claims';

const now = new Date('2026-11-21T15:00:00Z');
const STORE = { id: 'tienda-esperanza', lat: 4.5339, lng: -75.6811 };

// Dobles en memoria detrás de los puertos: la tienda del mapa, las solicitudes y el cambio de rol.
function setup(options: { claims?: MerchantClaim[] } = {}) {
  const claims = [...(options.claims ?? [])];
  const merchants: string[] = [];
  const claim = new ClaimEstablishment({
    establishments: {
      find: (id) => Promise.resolve(id === STORE.id ? { lat: STORE.lat, lng: STORE.lng } : null),
    },
    claims: {
      ownerOf: (id) =>
        Promise.resolve(claims.find((c) => c.establishmentId === id)?.accountId ?? null),
      establishmentOf: (accountId) =>
        Promise.resolve(claims.find((c) => c.accountId === accountId)?.establishmentId ?? null),
      save: (saved) => {
        claims.push(saved);
        return Promise.resolve();
      },
    },
    roles: {
      grantMerchant: (accountId) => {
        merchants.push(accountId);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { claim, claims, merchants };
}

const request = (overrides: Partial<ClaimRequest> = {}): ClaimRequest => ({
  accountId: 'cuenta-de-dona-rosa',
  establishmentId: STORE.id,
  responsibleName: '  Rosa Gómez ',
  nit: '800.197.268-4',
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  // A unos 20 m de la tienda.
  location: { lat: STORE.lat + 0.00018, lng: STORE.lng },
  ...overrides,
});

describe('registrar un comercio con una tienda del mapa (RF-015, D2 y D3 del grill comercial)', () => {
  it('en la tienda y sin dueño, queda verificado, es comercio y no se guarda su ubicación', async () => {
    const { claim, claims, merchants } = setup();

    const result = await claim.execute(request());

    expect(result).toEqual({ status: 'verificado', establishmentId: STORE.id });
    expect(merchants).toEqual(['cuenta-de-dona-rosa']);
    expect(claims).toEqual([
      {
        accountId: 'cuenta-de-dona-rosa',
        establishmentId: STORE.id,
        responsibleName: 'Rosa Gómez',
        nit: '800.197.268-4',
        informal: false,
        phone: '3001234567',
        acceptedTermsVersion: '2026-11',
        status: 'verificado',
        verifiedAt: now,
      },
    ]);
  });

  it('a más de 50 m de la tienda se rechaza, sin guardar nada ni cambiar el rol', async () => {
    const { claim, claims, merchants } = setup();

    // A unos 110 m de la tienda.
    const far = request({ location: { lat: STORE.lat + 0.001, lng: STORE.lng } });

    await expect(claim.execute(far)).rejects.toThrow(NotAtEstablishmentError);
    expect(claims).toEqual([]);
    expect(merchants).toEqual([]);
  });
});
