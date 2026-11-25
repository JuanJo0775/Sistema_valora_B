import { ClaimsOfProposals } from './claims-of-proposals';
import type { MerchantClaim } from './merchant-claims';

const claim: MerchantClaim = {
  accountId: 'cuenta-de-luis',
  establishmentId: 'propuesta-1',
  responsibleName: 'Luis Ramírez',
  nit: '800.197.268-4',
  informal: false,
  phone: '3157654321',
  acceptedTermsVersion: '2026-11',
  status: 'pre_aprobado',
  verifiedAt: null,
};

const source = (claims: MerchantClaim[]) =>
  new ClaimsOfProposals({
    pendingForMany: (ids) =>
      Promise.resolve(claims.filter((found) => ids.includes(found.establishmentId))),
  });

describe('reclamos de las tiendas propuestas, para el moderador (H5)', () => {
  it('por cada propuesta con reclamo: responsable, teléfono, NIT y que aprobarla concede el rol', async () => {
    const found = await source([claim]).of(['propuesta-1', 'propuesta-sin-reclamo']);

    expect([...found]).toEqual([
      [
        'propuesta-1',
        {
          responsibleName: 'Luis Ramírez',
          phone: '3157654321',
          nit: '800.197.268-4',
          grantsMerchantRole: true,
        },
      ],
    ]);
    // EC-08: nunca la cuenta, ni nada más de la solicitud.
    expect(JSON.stringify([...found])).not.toMatch(/cuenta-de-luis|accountId|acceptedTerms/);
  });

  it('sin NIT (tienda informal) el campo no aparece', async () => {
    const found = await source([{ ...claim, nit: null, informal: true }]).of(['propuesta-1']);

    expect(found.get('propuesta-1')).not.toHaveProperty('nit');
  });
});
