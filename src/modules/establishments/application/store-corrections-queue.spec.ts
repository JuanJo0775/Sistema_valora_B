import type { EstablishmentDetail } from './establishment-repository';
import type { StoreCorrection } from './store-details';
import { StoreCorrectionsQueue } from './store-corrections-queue';

const STORE: EstablishmentDetail = {
  id: 'tienda-esperanza',
  name: 'Tienda La Esperanza',
  type: 'barrio',
  lat: 4.5339,
  lng: -75.6811,
  municipality: 'armenia',
};

const correction: StoreCorrection = {
  id: 'correccion-1',
  establishmentId: STORE.id,
  name: 'Tienda El Sol',
  location: { lat: 4.534, lng: -75.6812 },
  proposerKey: 'clave-de-dona-rosa',
  createdAt: new Date('2026-11-22T15:00:00Z'),
};

describe('correcciones de tiendas pendientes (D5 del grill comercial, cola de la #27)', () => {
  it('cada corrección trae el valor actual y el propuesto, y los posibles duplicados del nombre', async () => {
    const queue = new StoreCorrectionsQueue({
      corrections: { pending: () => Promise.resolve([correction]) },
      stores: {
        findById: (id) => Promise.resolve(id === STORE.id ? STORE : null),
        findWithinMeters: () =>
          Promise.resolve([
            { id: STORE.id, name: STORE.name, distanceM: 0 },
            { id: 'vecina', name: 'Minimercado El Sol', distanceM: 40 },
          ]),
      },
    });

    const items = await queue.list();

    expect(items).toEqual([
      {
        kind: 'correccion',
        id: 'correccion-1',
        establishmentId: STORE.id,
        current: { name: 'Tienda La Esperanza', lat: 4.5339, lng: -75.6811 },
        proposed: { name: 'Tienda El Sol', lat: 4.534, lng: -75.6812 },
        possibleDuplicates: [{ id: 'vecina', name: 'Minimercado El Sol', distanceM: 40 }],
        createdAt: correction.createdAt,
      },
    ]);
    // EC-08: nunca quién la pidió.
    expect(JSON.stringify(items)).not.toContain('clave-de-dona-rosa');
  });
});
