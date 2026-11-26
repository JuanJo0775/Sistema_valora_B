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

// #257: la otra mitad del número de la pestaña «Tiendas» del panel de moderación.
describe('cuántas correcciones de tienda esperan decisión (#257)', () => {
  const queueWith = (pending: StoreCorrection[]) =>
    new StoreCorrectionsQueue({
      corrections: { pending: () => Promise.resolve(pending) },
      stores: {
        findById: (id) => Promise.resolve(id === STORE.id ? STORE : null),
        findWithinMeters: () => Promise.resolve([]),
      },
    });

  it('sin correcciones son cero', async () => {
    await expect(queueWith([]).count()).resolves.toBe(0);
  });

  it('cuenta las correcciones pendientes de tiendas que todavía existen', async () => {
    const queue = queueWith([correction, { ...correction, id: 'correccion-2' }]);

    await expect(queue.count()).resolves.toBe(2);
  });

  // Igual que la lista: una corrección de una tienda que ya no existe no se muestra, así que
  // tampoco cuenta (el número y la lista deben coincidir).
  it('no cuenta la corrección de una tienda que ya no existe', async () => {
    const orphan = { ...correction, id: 'correccion-3', establishmentId: 'tienda-eliminada' };
    const queue = queueWith([correction, orphan]);

    await expect(queue.list()).resolves.toHaveLength(1);
    await expect(queue.count()).resolves.toBe(1);
  });
});
