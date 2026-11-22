import type { DomainEvent } from '../../../shared/events';
import { AccountHasEstablishmentError } from './claim-establishment';
import {
  ClaimProposedEstablishment,
  type ProposedClaimRequest,
  type ProposedStore,
} from './claim-proposed-establishment';
import type { MerchantClaim } from './merchant-claims';

const now = new Date('2026-11-21T15:00:00Z');
// Punto del celular en la tienda que no está en el mapa: marca la tienda (D2).
const HERE = { lat: 4.4613, lng: -75.6674 };

// Dobles en memoria detrás de los puertos: la cola de propuestas de establishments y las solicitudes.
function setup(options: { claims?: MerchantClaim[] } = {}) {
  const claims = [...(options.claims ?? [])];
  const events: DomainEvent[] = [];
  const proposed: { store: ProposedStore; accountId: string }[] = [];
  const claim = new ClaimProposedEstablishment({
    proposals: {
      propose: (store, accountId) => {
        proposed.push({ store, accountId });
        return Promise.resolve('propuesta-1');
      },
    },
    claims: {
      establishmentOf: (accountId) =>
        Promise.resolve(claims.find((c) => c.accountId === accountId)?.establishmentId ?? null),
      save: (saved, published) => {
        claims.push(saved);
        events.push(...published);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { claim, claims, events, proposed };
}

const request = (overrides: Partial<ProposedClaimRequest> = {}): ProposedClaimRequest => ({
  accountId: 'cuenta-de-don-luis',
  newEstablishment: { name: 'Tienda El Paraíso', type: 'barrio', municipality: 'cordoba' },
  responsibleName: 'Luis Ramírez',
  phone: '3157654321',
  acceptedTermsVersion: '2026-11',
  location: HERE,
  ...overrides,
});

describe('registrar un comercio con una tienda que no está en el mapa (RF-015, RF-005 RN7, D2)', () => {
  it('propone la tienda en el punto del celular y queda pre-aprobado con lo que se desbloquea', async () => {
    const { claim, claims, events, proposed } = setup();

    const result = await claim.execute(request());

    // La tienda pasa por la revisión de propuestas que ya existe (RF-005 RN7).
    expect(proposed).toEqual([
      {
        store: { name: 'Tienda El Paraíso', type: 'barrio', municipality: 'cordoba', ...HERE },
        accountId: 'cuenta-de-don-luis',
      },
    ]);
    expect(result).toEqual({
      status: 'pre_aprobado',
      establishmentId: 'propuesta-1',
      unlocks: [
        'precios_oficiales',
        'carga_por_archivo',
        'promociones',
        'avisos_de_precio',
        'datos_de_la_tienda',
      ],
    });
    expect(claims).toEqual([
      {
        accountId: 'cuenta-de-don-luis',
        establishmentId: 'propuesta-1',
        responsibleName: 'Luis Ramírez',
        nit: null,
        informal: true,
        phone: '3157654321',
        acceptedTermsVersion: '2026-11',
        status: 'pre_aprobado',
        verifiedAt: null,
      },
    ]);
    // Todavía no es comercio: el rol cambia cuando se aprueba la tienda.
    expect(events).toEqual([]);
  });

  it('una cuenta que ya tiene una tienda, aunque esté pre-aprobada, no propone otra', async () => {
    const { claim, proposed } = setup();
    await claim.execute(request());

    await expect(
      claim.execute(
        request({ newEstablishment: { name: 'Otra', type: 'barrio', municipality: 'cordoba' } }),
      ),
    ).rejects.toThrow(AccountHasEstablishmentError);
    expect(proposed).toHaveLength(1);
  });
});
