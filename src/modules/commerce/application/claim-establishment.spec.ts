import {
  AccountHasEstablishmentError,
  ClaimEstablishment,
  type ClaimRequest,
  EstablishmentHasOwnerError,
  EstablishmentNotFoundError,
  InvalidNitError,
  NotAtEstablishmentError,
} from './claim-establishment';
import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim } from './merchant-claims';

const now = new Date('2026-11-21T15:00:00Z');
const STORE = { id: 'tienda-esperanza', lat: 4.5339, lng: -75.6811 };

// Dobles en memoria detrás de los puertos: la tienda del mapa, las solicitudes y el cambio de rol.
function setup(options: { claims?: MerchantClaim[] } = {}) {
  const claims = [...(options.claims ?? [])];
  // Eventos guardados junto con la solicitud, en la misma transacción (ADR-015).
  const events: DomainEvent[] = [];
  const disputes: { establishmentId: string; accountId: string }[] = [];
  const claim = new ClaimEstablishment({
    establishments: {
      find: (id) => Promise.resolve(id === STORE.id ? { lat: STORE.lat, lng: STORE.lng } : null),
    },
    claims: {
      ownerOf: (id) =>
        Promise.resolve(claims.find((c) => c.establishmentId === id)?.accountId ?? null),
      establishmentOf: (accountId) =>
        Promise.resolve(claims.find((c) => c.accountId === accountId)?.establishmentId ?? null),
      save: (saved, published) => {
        claims.push(saved);
        events.push(...published);
        return Promise.resolve();
      },
    },
    // Precisión de D3 (#208): una disputa para el moderador.
    disputes: {
      open: (establishmentId, accountId) => {
        disputes.push({ establishmentId, accountId });
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { claim, claims, events, disputes };
}

const verifiedClaim = (accountId: string, establishmentId: string): MerchantClaim => ({
  accountId,
  establishmentId,
  responsibleName: 'Otra persona',
  nit: null,
  informal: true,
  phone: '3109876543',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-20T10:00:00Z'),
});

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
  it('en la tienda y sin dueño, queda verificado, avisa MerchantVerified y no guarda su ubicación', async () => {
    const { claim, claims, events } = setup();

    const result = await claim.execute(request());

    expect(result).toEqual({ status: 'verificado', establishmentId: STORE.id });
    // identity lo recibe y cambia el rol a comercio (D3); no se pierde aunque falle una vez.
    expect(events).toEqual([
      {
        id: expect.any(String) as unknown,
        type: 'MerchantVerified',
        version: 1,
        occurredAt: expect.any(Date) as unknown,
        payload: { accountId: 'cuenta-de-dona-rosa', establishmentId: STORE.id },
      },
    ]);
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

  it('a más de 50 m de la tienda se rechaza, sin guardar nada ni avisar', async () => {
    const { claim, claims, events } = setup();

    // A unos 110 m de la tienda.
    const far = request({ location: { lat: STORE.lat + 0.001, lng: STORE.lng } });

    await expect(claim.execute(far)).rejects.toThrow(NotAtEstablishmentError);
    expect(claims).toEqual([]);
    expect(events).toEqual([]);
  });

  it('una tienda que no está en el mapa se rechaza: va por la propuesta de tienda (B2)', async () => {
    const { claim, claims } = setup();

    await expect(claim.execute(request({ establishmentId: 'no-existe' }))).rejects.toThrow(
      EstablishmentNotFoundError,
    );
    expect(claims).toEqual([]);
  });

  it('una tienda que ya tiene dueño se rechaza, el dueño no cambia y queda una disputa', async () => {
    const owner = verifiedClaim('cuenta-del-dueno', STORE.id);
    const { claim, claims, events, disputes } = setup({ claims: [owner] });

    await expect(claim.execute(request())).rejects.toThrow(EstablishmentHasOwnerError);
    expect(claims).toEqual([owner]);
    expect(events).toEqual([]);
    // Precisión de D3 (#208): estaba en la tienda (presencia), así que el moderador decide.
    expect(disputes).toEqual([{ establishmentId: STORE.id, accountId: 'cuenta-de-dona-rosa' }]);
  });

  it('una cuenta que ya tiene una tienda no puede registrar otra (una por cuenta)', async () => {
    const own = verifiedClaim('cuenta-de-dona-rosa', 'otra-tienda');
    const { claim, claims } = setup({ claims: [own] });

    await expect(claim.execute(request())).rejects.toThrow(AccountHasEstablishmentError);
    expect(claims).toEqual([own]);
  });

  it('un NIT con el dígito de verificación equivocado se rechaza: está mal escrito', async () => {
    const { claim, claims } = setup();

    await expect(claim.execute(request({ nit: '800.197.268-5' }))).rejects.toThrow(InvalidNitError);
    expect(claims).toEqual([]);
  });

  it('sin NIT, la tienda de barrio queda registrada como informal', async () => {
    const { claim, claims } = setup();

    await claim.execute(request({ nit: undefined }));

    expect(claims[0]).toMatchObject({ nit: null, informal: true });
  });
});
