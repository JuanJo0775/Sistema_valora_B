import type { MerchantClaim } from './merchant-claims';
import { VerifiedMerchants } from './verified-merchants';

const claim = (establishmentId: string, change: Partial<MerchantClaim> = {}): MerchantClaim => ({
  accountId: `cuenta-de-${establishmentId}`,
  establishmentId,
  responsibleName: 'Rosa Gómez',
  nit: '900123456-7',
  informal: false,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
  ...change,
});

function setup(claims: MerchantClaim[], total = claims.length) {
  const asked: number[] = [];
  const list = new VerifiedMerchants({
    claims: {
      listVerified: (limit) => {
        asked.push(limit);
        return Promise.resolve({ items: claims.slice(0, limit), total });
      },
    },
    establishments: {
      find: (id) => Promise.resolve(id === 'sin-tienda' ? null : { name: `Tienda ${id}` }),
    },
  });
  return { asked, list };
}

// H14: moderación solo veía casos; ahora ve también los comercios verificados.
describe('comercios verificados para moderación (H14)', () => {
  it('cada comercio trae su tienda, su responsable, su NIT, su teléfono y desde cuándo está verificado', async () => {
    const { list } = setup([claim('la-rosa')]);

    const result = await list.execute();

    expect(result.items).toEqual([
      {
        establishment: { id: 'la-rosa', name: 'Tienda la-rosa' },
        responsibleName: 'Rosa Gómez',
        nit: '900123456-7',
        phone: '3001234567',
        verifiedAt: new Date('2026-11-21T15:00:00Z'),
      },
    ]);
  });

  it('nunca trae la cuenta del comercio (EC-08)', async () => {
    const { list } = setup([claim('la-rosa')]);

    expect(JSON.stringify(await list.execute())).not.toContain('cuenta-de-la-rosa');
  });

  it('un comercio informal dice que no tiene NIT', async () => {
    const { list } = setup([claim('la-rosa', { nit: null, informal: true })]);

    expect((await list.execute()).items[0]?.nit).toBeNull();
  });

  it('pide un máximo de 100 y dice cuántos hay en total', async () => {
    const { asked, list } = setup([claim('la-rosa')], 340);

    const result = await list.execute();

    expect(asked).toEqual([100]);
    expect(result.total).toBe(340);
  });
});
