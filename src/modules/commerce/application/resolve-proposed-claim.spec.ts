import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim, MerchantClaimRejection } from './merchant-claims';
import { ResolveProposedClaim } from './resolve-proposed-claim';

const now = new Date('2026-11-22T09:00:00Z');
const note = 'Tienda verificada en el sitio';

const preApproved: MerchantClaim = {
  accountId: 'cuenta-de-don-luis',
  establishmentId: 'propuesta-1',
  responsibleName: 'Luis Ramírez',
  nit: null,
  informal: true,
  phone: '3157654321',
  acceptedTermsVersion: '2026-11',
  status: 'pre_aprobado',
  verifiedAt: null,
};

// Dobles en memoria detrás del puerto de solicitudes.
function setup(claims: MerchantClaim[] = [preApproved]) {
  const active = [...claims];
  const rejections: MerchantClaimRejection[] = [];
  const events: DomainEvent[] = [];
  const resolve = new ResolveProposedClaim({
    claims: {
      pendingFor: (establishmentId) =>
        Promise.resolve(
          active.find(
            (c) => c.establishmentId === establishmentId && c.status === 'pre_aprobado',
          ) ?? null,
        ),
      ownerOf: (establishmentId) =>
        Promise.resolve(
          active.find((c) => c.establishmentId === establishmentId)?.accountId ?? null,
        ),
      verify: (accountId, establishmentId, verifiedAt, published) => {
        const index = active.findIndex((c) => c.accountId === accountId);
        const current = active[index];
        if (current)
          active[index] = { ...current, establishmentId, status: 'verificado', verifiedAt };
        events.push(...published);
        return Promise.resolve();
      },
      reject: (rejection) => {
        active.splice(
          active.findIndex((c) => c.accountId === rejection.accountId),
          1,
        );
        rejections.push(rejection);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { resolve, active, rejections, events };
}

describe('la tienda propuesta por un comercio pre-aprobado se decide (D2 del grill comercial)', () => {
  it('aprobada: el comercio queda verificado solo y avisa MerchantVerified', async () => {
    const { resolve, active, events } = setup();

    await resolve.execute({ proposalId: 'propuesta-1', decision: 'aprobar', note });

    expect(active).toEqual([{ ...preApproved, status: 'verificado', verifiedAt: now }]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'MerchantVerified',
        version: 1,
        payload: { accountId: 'cuenta-de-don-luis', establishmentId: 'propuesta-1' },
      }),
    ]);
  });

  it('fusionada con una tienda sin dueño: queda verificado en esa tienda', async () => {
    const { resolve, active, events } = setup();

    await resolve.execute({
      proposalId: 'propuesta-1',
      decision: 'fusionar',
      mergeInto: 'tienda-existente',
      note,
    });

    expect(active).toEqual([
      {
        ...preApproved,
        establishmentId: 'tienda-existente',
        status: 'verificado',
        verifiedAt: now,
      },
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'MerchantVerified',
        payload: { accountId: 'cuenta-de-don-luis', establishmentId: 'tienda-existente' },
      }),
    ]);
  });

  it('fusionada con una tienda que ya tiene dueño: la solicitud se cierra y queda el motivo', async () => {
    const owner: MerchantClaim = {
      ...preApproved,
      accountId: 'cuenta-del-dueno',
      establishmentId: 'tienda-existente',
      status: 'verificado',
      verifiedAt: now,
    };
    const { resolve, active, rejections, events } = setup([preApproved, owner]);

    await resolve.execute({
      proposalId: 'propuesta-1',
      decision: 'fusionar',
      mergeInto: 'tienda-existente',
      note,
    });

    expect(active).toEqual([owner]);
    expect(rejections).toEqual([
      {
        accountId: 'cuenta-de-don-luis',
        establishmentId: 'tienda-existente',
        reason: 'La tienda que propusiste ya estaba en el mapa y tiene dueño.',
        rejectedAt: now,
      },
    ]);
    expect(events).toEqual([]);
  });
});
