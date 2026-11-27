import { StoreProposalsQueue } from './store-proposals-queue';
import type { NewStoreProposal } from './store-proposals';
import { type ProposalClaim, ProposalClaims } from './proposal-claims';

const proposal = (change: Partial<NewStoreProposal>): NewStoreProposal => ({
  id: 'propuesta-1',
  name: 'Tienda Esperanza',
  type: 'barrio',
  lat: 4.5339,
  lng: -75.6811,
  municipality: 'armenia',
  proposerKey: 'clave-de-quien-propone',
  createdAt: new Date('2026-11-15T10:00:00Z'),
  ...change,
});

function setup(
  pending: NewStoreProposal[],
  nearby: { id: string; name: string; distanceM: number }[],
  claimsByProposal: Record<string, ProposalClaim> = {},
) {
  const asked: number[] = [];
  const claims = new ProposalClaims();
  claims.register({
    of: (ids) =>
      Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const claim = claimsByProposal[id];
            return claim ? [[id, claim] as const] : [];
          }),
        ),
      ),
  });
  const queue = new StoreProposalsQueue({
    claims,
    proposals: { pending: () => Promise.resolve(pending) },
    stores: {
      findWithinMeters: (_point, meters) => {
        asked.push(meters);
        return Promise.resolve(nearby);
      },
    },
  });
  return { asked, queue };
}

describe('propuestas de tiendas pendientes (RF-005 RN1 y RN3, grill de la #27)', () => {
  it('cada propuesta trae sus posibles duplicados: nombre equivalente a menos de 50 m', async () => {
    const { asked, queue } = setup(
      [proposal({})],
      [
        { id: 'tienda-1', name: 'Tienda La Esperanza', distanceM: 30 },
        { id: 'tienda-2', name: 'Droguería El Sol', distanceM: 20 },
      ],
    );

    const items = await queue.list();

    expect(asked).toEqual([50]);
    expect(items).toEqual([
      {
        id: 'propuesta-1',
        name: 'Tienda Esperanza',
        type: 'barrio',
        lat: 4.5339,
        lng: -75.6811,
        municipality: 'armenia',
        outOfZone: false,
        possibleDuplicates: [{ id: 'tienda-1', name: 'Tienda La Esperanza', distanceM: 30 }],
        createdAt: new Date('2026-11-15T10:00:00Z'),
      },
    ]);
    expect(JSON.stringify(items)).not.toContain('clave-de-quien-propone');
  });

  it('una propuesta fuera del Quindío llega marcada', async () => {
    const { queue } = setup([proposal({ lat: 4.711, lng: -74.0721 })], []);

    const [item] = await queue.list();

    expect(item).toMatchObject({ outOfZone: true, possibleDuplicates: [] });
  });

  // H16: sin límites oficiales no se rechaza; se avisa al moderador de una ubicación de otro municipio.
  it('una propuesta con un municipio que no cuadra con su ubicación trae el municipio sugerido', async () => {
    const { queue } = setup(
      [proposal({ lat: 4.4500501, lng: -75.7922013, municipality: 'armenia' })],
      [],
    );

    const [item] = await queue.list();

    expect(item).toMatchObject({ municipality: 'armenia', suggestedMunicipality: 'la-tebaida' });
  });

  it('una propuesta fuera del Quindío no sugiere municipio: ya va marcada como fuera de zona', async () => {
    const { queue } = setup([proposal({ lat: 4.711, lng: -74.0721 })], []);

    const [item] = await queue.list();

    expect(item).not.toHaveProperty('suggestedMunicipality');
  });

  // H5: aprobar una propuesta que nace de un reclamo verifica al solicitante como comerciante.
  it('una propuesta que nace de un reclamo trae al responsable y avisa que aprobarla concede el rol de comercio', async () => {
    const { queue } = setup(
      [proposal({}), proposal({ id: 'propuesta-2', name: 'Otra tienda' })],
      [],
      {
        'propuesta-1': {
          responsibleName: 'Luis Ramírez',
          phone: '3157654321',
          nit: '900.123.456-8',
          grantsMerchantRole: true,
        },
      },
    );

    const [withClaim, without] = await queue.list();

    expect(withClaim?.claim).toEqual({
      responsibleName: 'Luis Ramírez',
      phone: '3157654321',
      nit: '900.123.456-8',
      grantsMerchantRole: true,
    });
    // Sin reclamo no cambia: el campo ni aparece.
    expect(without).not.toHaveProperty('claim');
    expect(JSON.stringify([withClaim, without])).not.toContain('clave-de-quien-propone');
  });
});

// #257: el número de la pestaña «Tiendas» del panel de moderación.
describe('cuántas propuestas de tienda esperan decisión (#257)', () => {
  it('sin propuestas son cero', async () => {
    const { queue } = setup([], []);

    await expect(queue.count()).resolves.toBe(0);
  });

  it('cuenta todas las propuestas pendientes, también las que nacen de un reclamo', async () => {
    const { queue } = setup([proposal({ id: 'propuesta-1' }), proposal({ id: 'propuesta-2' })], []);

    await expect(queue.count()).resolves.toBe(2);
  });
});

describe('ProposalClaims (puerto que registra commerce)', () => {
  it('sin nadie registrado no hay reclamos: la cola de propuestas sigue igual', async () => {
    expect(await new ProposalClaims().of(['propuesta-1'])).toEqual(new Map());
  });

  it('con una fuente registrada, la consulta va a ella; sin ids no la molesta', async () => {
    const asked: string[][] = [];
    const claims = new ProposalClaims();
    claims.register({
      of: (ids) => {
        asked.push(ids);
        return Promise.resolve(new Map());
      },
    });

    await claims.of([]);
    await claims.of(['a', 'b']);

    expect(asked).toEqual([['a', 'b']]);
  });
});
