import type { DomainEvent } from '../../../shared/events';
import {
  DeleteMyEstablishment,
  EstablishmentNotCreatedByAccountError,
  NoEstablishmentError,
} from './delete-my-establishment';
import type { MerchantClaim } from './merchant-claims';
import type { MerchantDeparture } from './merchant-departures';
import { MerchantNotVerifiedError } from './publish-official-price';

const now = new Date('2026-11-24T12:00:00Z');
const STORE = 'tienda-nueva';

const owner: MerchantClaim = {
  accountId: 'cuenta-del-dueno',
  establishmentId: STORE,
  responsibleName: 'Luis Ramírez',
  nit: null,
  informal: true,
  phone: '3157654321',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
  createdEstablishment: true,
};

function setup(claim: MerchantClaim | null = owner) {
  const departures: { departure: MerchantDeparture; events: DomainEvent[] }[] = [];
  const remove = new DeleteMyEstablishment({
    claims: { findByAccount: () => Promise.resolve(claim) },
    prices: { listFor: () => Promise.resolve([]) },
    promotions: { listFor: () => Promise.resolve([]) },
    departures: {
      depart: (departure, events) => {
        departures.push({ departure, events });
        return Promise.resolve(true);
      },
    },
    clock: { now: () => now },
  });
  return { remove, departures };
}

// H36: solo quien creó la tienda puede eliminarla.
describe('eliminar la tienda propia (H36)', () => {
  it('si la cuenta creó la tienda, se retira la solicitud y se publica el retiro de la tienda', async () => {
    const { remove, departures } = setup();

    await remove.execute('cuenta-del-dueno');

    expect(departures[0]?.departure).toEqual({
      accountId: 'cuenta-del-dueno',
      establishmentId: STORE,
      kind: 'eliminada',
      departedAt: now,
    });
    expect(departures[0]?.events.map((event) => event.type)).toEqual([
      'MerchantLeft',
      'MerchantEstablishmentDeleted',
    ]);
    expect(departures[0]?.events[1]?.payload).toEqual({ establishmentId: STORE });
  });

  it('una tienda del catálogo o ajena (no creada por la cuenta) no se elimina y no cambia nada', async () => {
    const { createdEstablishment: _created, ...unmarked } = owner;
    for (const claim of [{ ...owner, createdEstablishment: false }, unmarked]) {
      const { remove, departures } = setup(claim);

      await expect(remove.execute('cuenta-del-dueno')).rejects.toBeInstanceOf(
        EstablishmentNotCreatedByAccountError,
      );
      expect(departures).toEqual([]);
    }
  });

  it('sin tienda no hay qué eliminar', async () => {
    const { remove } = setup(null);

    await expect(remove.execute('cuenta-sin-tienda')).rejects.toBeInstanceOf(NoEstablishmentError);
  });

  it('una solicitud pre-aprobada aún no tiene tienda en el mapa: no se elimina', async () => {
    const { remove } = setup({ ...owner, status: 'pre_aprobado', verifiedAt: null });

    await expect(remove.execute('cuenta-del-dueno')).rejects.toBeInstanceOf(
      MerchantNotVerifiedError,
    );
  });
});
