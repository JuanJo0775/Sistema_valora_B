import { StoreProposalsQueue } from './store-proposals-queue';
import type { NewStoreProposal } from './store-proposals';

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
) {
  const asked: number[] = [];
  const queue = new StoreProposalsQueue({
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
});
