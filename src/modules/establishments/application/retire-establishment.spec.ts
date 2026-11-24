import { RetireEstablishment } from './retire-establishment';

const now = new Date('2026-11-24T12:00:00Z');

// H36: una tienda eliminada por su creador pasa a «retirada», no se destruye.
describe('retirar una tienda del mapa (H36)', () => {
  it('la marca retirada con la fecha, sin borrar nada', async () => {
    const retired: { id: string; at: Date }[] = [];
    const retire = new RetireEstablishment({
      stores: {
        retire: (id, at) => {
          retired.push({ id, at });
          return Promise.resolve(true);
        },
      },
      clock: { now: () => now },
    });

    await retire.execute('tienda-nueva');

    expect(retired).toEqual([{ id: 'tienda-nueva', at: now }]);
  });

  it('retirarla otra vez no falla (el evento puede llegar repetido)', async () => {
    const retire = new RetireEstablishment({
      stores: { retire: () => Promise.resolve(false) },
      clock: { now: () => now },
    });

    await expect(retire.execute('tienda-nueva')).resolves.toBeUndefined();
  });
});
