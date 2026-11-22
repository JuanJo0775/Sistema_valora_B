import type { OpeningHours } from '../../../domain/opening-hours';
import type { EstablishmentDetail } from './establishment-repository';
import type { StoreCorrection, StoreDetailsChange } from './store-details';
import { UpdateStoreDetails, type UpdateStoreDetailsRequest } from './update-store-details';

const now = new Date('2026-11-22T15:00:00Z');
const STORE: EstablishmentDetail = {
  id: 'tienda-esperanza',
  name: 'Tienda La Esperanza',
  type: 'barrio',
  lat: 4.5339,
  lng: -75.6811,
  municipality: 'armenia',
};
const day = { opens: '07:00', closes: '20:00' };
const hours: OpeningHours = {
  lunes: day,
  martes: day,
  miercoles: day,
  jueves: day,
  viernes: day,
  sabado: day,
  domingo: null,
};

// Dobles detrás de los puertos: la tienda, sus vecinas, los cambios aplicados y la cola de revisión.
function setup(neighbors: { id: string; name: string; distanceM: number }[] = []) {
  const applied: { establishmentId: string; change: StoreDetailsChange }[] = [];
  const corrections: StoreCorrection[] = [];
  const update = new UpdateStoreDetails({
    stores: {
      findById: (id) => Promise.resolve(id === STORE.id ? STORE : null),
      findWithinMeters: () =>
        Promise.resolve([{ id: STORE.id, name: STORE.name, distanceM: 0 }, ...neighbors]),
      applyDetails: (establishmentId, change) => {
        applied.push({ establishmentId, change });
        return Promise.resolve();
      },
    },
    corrections: {
      propose: (correction) => {
        corrections.push(correction);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { update, applied, corrections };
}

const request = (change: Partial<UpdateStoreDetailsRequest> = {}): UpdateStoreDetailsRequest => ({
  establishmentId: STORE.id,
  proposerKey: 'clave-de-dona-rosa',
  ...change,
});

describe('el comercio corrige los datos de su tienda (D5 del grill comercial)', () => {
  it('el horario y el teléfono se aplican al instante', async () => {
    const { update, applied, corrections } = setup();

    const result = await update.execute(request({ openingHours: hours, phone: '6067441234' }));

    expect(result).toEqual({ applied: ['openingHours', 'phone'], inReview: [] });
    expect(applied).toEqual([
      { establishmentId: STORE.id, change: { openingHours: hours, phone: '6067441234' } },
    ]);
    expect(corrections).toEqual([]);
  });

  it('un nombre nuevo sin una tienda vecina parecida se aplica al instante', async () => {
    const { update, applied, corrections } = setup([
      { id: 'vecina', name: 'Panadería El Trigal', distanceM: 30 },
    ]);

    const result = await update.execute(request({ name: '  Tienda Esperanza de Rosa ' }));

    expect(result).toEqual({ applied: ['name'], inReview: [] });
    expect(applied).toEqual([
      { establishmentId: STORE.id, change: { name: 'Tienda Esperanza de Rosa' } },
    ]);
    expect(corrections).toEqual([]);
  });
});
