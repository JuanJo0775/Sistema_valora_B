import {
  AccountHasEstablishmentError,
  ClaimEstablishment,
  type ClaimRequest,
  EstablishmentHasOwnerError,
  EstablishmentNotFoundError,
  InvalidNitError,
  ChainStoreNotClaimableError,
  NotAtEstablishmentError,
  RevokedFromEstablishmentError,
} from './claim-establishment';
import type { DomainEvent } from '../../../shared/events';
import type { MerchantCase } from './merchant-cases';
import type { MerchantClaim } from './merchant-claims';

const now = new Date('2026-11-21T15:00:00Z');
const STORE = { id: 'tienda-esperanza', lat: 4.5339, lng: -75.6811 };
type StoreType = 'barrio' | 'minimercado' | 'supermercado' | 'descuento';

// Dobles en memoria detrás de los puertos: la tienda del mapa, las solicitudes y el cambio de rol.
function setup(
  options: {
    claims?: MerchantClaim[];
    revoked?: string[];
    store?: { name: string; type: StoreType };
  } = {},
) {
  const store = options.store ?? { name: 'Tienda La Esperanza', type: 'barrio' };
  const claims = [...(options.claims ?? [])];
  // H11: el caso que se abre junto con la solicitud pre-aprobada, en la misma transacción.
  const reviewCases: MerchantCase[] = [];
  // Eventos guardados junto con la solicitud, en la misma transacción (ADR-015).
  const events: DomainEvent[] = [];
  const disputes: {
    establishmentId: string;
    accountId: string;
    challenger: { responsibleName: string; nit: string | null; phone: string };
  }[] = [];
  const claim = new ClaimEstablishment({
    establishments: {
      find: (id) =>
        Promise.resolve(id === STORE.id ? { lat: STORE.lat, lng: STORE.lng, ...store } : null),
    },
    // Clave seudónima de quien reclama (EC-08): la que lleva el caso, nunca la cuenta.
    reporters: { keyOf: (accountId) => Promise.resolve(`clave-de-${accountId}`) },
    claims: {
      ownerOf: (id) =>
        Promise.resolve(claims.find((c) => c.establishmentId === id)?.accountId ?? null),
      establishmentOf: (accountId) =>
        Promise.resolve(claims.find((c) => c.accountId === accountId)?.establishmentId ?? null),
      // Precisión de D3 (#208): las tiendas de las que esta cuenta fue revocada.
      wasRevokedFrom: (_accountId, establishmentId) =>
        Promise.resolve((options.revoked ?? []).includes(establishmentId)),
      save: (saved, published, reviewCase) => {
        claims.push(saved);
        events.push(...published);
        if (reviewCase) reviewCases.push(reviewCase);
        return Promise.resolve();
      },
    },
    // Precisión de D3 (#208): una disputa para el moderador.
    disputes: {
      open: (establishmentId, accountId, challenger) => {
        disputes.push({ establishmentId, accountId, challenger });
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { claim, claims, events, disputes, reviewCases };
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
    // H18: la disputa guarda los datos de quien disputa para que el moderador compare a las dos partes.
    expect(disputes).toEqual([
      {
        establishmentId: STORE.id,
        accountId: 'cuenta-de-dona-rosa',
        challenger: {
          responsibleName: 'Rosa Gómez',
          nit: request().nit ?? null,
          phone: request().phone,
        },
      },
    ]);
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

  // Precisión de D3 (#208): si pudiera volver a registrarla al instante, revocar no serviría.
  it('una cuenta revocada de esta tienda no la vuelve a registrar; otra tienda sí', async () => {
    const { claim, claims } = setup({ revoked: [STORE.id] });

    await expect(claim.execute(request())).rejects.toThrow(RevokedFromEstablishmentError);
    expect(claims).toEqual([]);
  });

  describe('tiendas de cadena (H11, ADR-037)', () => {
    it.each([
      ['D1 Avenida 19', 'descuento'],
      ['Ara Calle 14', 'descuento'],
      ['Éxito Armenia', 'supermercado'],
      ['Olímpica Express', 'supermercado'],
      ['Carulla', 'supermercado'],
      ['Oxxo La Tebaida', 'minimercado'],
    ] as const)(
      '«%s» (%s) no se puede reclamar: nada se guarda, ni evento ni disputa',
      async (name, type) => {
        const owner = verifiedClaim('cuenta-del-dueno', STORE.id);
        const { claim, claims, events, disputes, reviewCases } = setup({
          store: { name, type },
          claims: [owner],
        });

        await expect(claim.execute(request())).rejects.toThrow(ChainStoreNotClaimableError);
        expect(claims).toEqual([owner]);
        expect(events).toEqual([]);
        expect(disputes).toEqual([]);
        expect(reviewCases).toEqual([]);
      },
    );

    it('el rechazo por cadena llega antes que el de la cercanía, para no dar una pista falsa', async () => {
      const { claim } = setup({ store: { name: 'D1 Centro', type: 'descuento' } });
      const far = request({ location: { lat: STORE.lat + 0.001, lng: STORE.lng } });

      await expect(claim.execute(far)).rejects.toThrow(ChainStoreNotClaimableError);
    });

    it('el error lleva el código estable y un mensaje claro en español', () => {
      const error = new ChainStoreNotClaimableError();

      expect(error.code).toBe('CHAIN_STORE_NOT_CLAIMABLE');
      expect(error.message).toMatch(/cadena/i);
    });

    it('«Panadería D10» no es D1: sigue la verificación instantánea', async () => {
      const { claim } = setup({ store: { name: 'Panadería D10', type: 'barrio' } });

      await expect(claim.execute(request())).resolves.toMatchObject({ status: 'verificado' });
    });
  });

  describe('supermercado que no es cadena: pre-aprobado hasta que modere (H11)', () => {
    const supermarket = { name: 'Supermercado Laureles', type: 'supermercado' } as const;

    it('queda pre_aprobado, sin MerchantVerified, con un caso de reclamo para el moderador', async () => {
      const { claim, claims, events, reviewCases } = setup({ store: supermarket });

      const result = await claim.execute(request());

      expect(result).toEqual({
        status: 'pre_aprobado',
        establishmentId: STORE.id,
        unlocks: expect.arrayContaining(['precios_oficiales']) as unknown,
      });
      expect(claims).toEqual([
        expect.objectContaining({ status: 'pre_aprobado', verifiedAt: null }),
      ]);
      // El rol no cambia hasta que el moderador apruebe.
      expect(events).toEqual([]);
      expect(reviewCases).toEqual([
        {
          id: expect.any(String) as unknown,
          establishmentId: STORE.id,
          kind: 'reclamo',
          reporterKey: 'clave-de-cuenta-de-dona-rosa',
          reason: expect.stringContaining('revis') as unknown,
          createdAt: now,
        },
      ]);
    });

    it('sigue pidiendo la cercanía de 50 m', async () => {
      const { claim, claims, reviewCases } = setup({ store: supermarket });
      const far = request({ location: { lat: STORE.lat + 0.001, lng: STORE.lng } });

      await expect(claim.execute(far)).rejects.toThrow(NotAtEstablishmentError);
      expect(claims).toEqual([]);
      expect(reviewCases).toEqual([]);
    });

    it('con dueño, sigue la disputa de siempre y no se abre un caso de reclamo', async () => {
      const owner = verifiedClaim('cuenta-del-dueno', STORE.id);
      const { claim, disputes, reviewCases } = setup({ store: supermarket, claims: [owner] });

      await expect(claim.execute(request())).rejects.toThrow(EstablishmentHasOwnerError);
      expect(disputes).toHaveLength(1);
      expect(reviewCases).toEqual([]);
    });
  });

  it('barrio y minimercado: verificación instantánea, sin caso de moderación', async () => {
    const { claim, reviewCases } = setup({
      store: { name: 'Minimercado El Veci', type: 'minimercado' },
    });

    await expect(claim.execute(request())).resolves.toMatchObject({ status: 'verificado' });
    expect(reviewCases).toEqual([]);
  });
});
