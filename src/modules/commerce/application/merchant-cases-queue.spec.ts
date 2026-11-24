import type { MerchantCase } from './merchant-cases';
import { MerchantCasesQueue } from './merchant-cases-queue';
import type { MerchantClaim } from './merchant-claims';

const STORE = 'tienda-esperanza';

const owner: MerchantClaim = {
  accountId: 'cuenta-del-dueno',
  establishmentId: STORE,
  responsibleName: 'Rosa Gómez',
  nit: '800.197.268-4',
  informal: false,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
};

const report: MerchantCase = {
  id: 'caso-1',
  establishmentId: STORE,
  kind: 'denuncia',
  reporterKey: 'clave-de-ana',
  reason: 'El dueño real es don Luis.',
  createdAt: new Date('2026-11-22T15:00:00Z'),
};

describe('casos de comercios pendientes (GET /moderation/merchant-cases, D2 y D3)', () => {
  it('cada caso trae la tienda, el dueño para verificarlo y el motivo; nunca quién lo abrió', async () => {
    const queue = new MerchantCasesQueue({
      cases: { pending: () => Promise.resolve([report]) },
      claims: {
        findByEstablishment: (id) => Promise.resolve(id === STORE ? owner : null),
      },
      establishments: {
        find: (id) => Promise.resolve(id === STORE ? { name: 'Tienda La Esperanza' } : null),
      },
    });

    const items = await queue.list();

    expect(items).toEqual([
      {
        id: 'caso-1',
        kind: 'denuncia',
        establishment: { id: STORE, name: 'Tienda La Esperanza' },
        owner: {
          responsibleName: 'Rosa Gómez',
          nit: '800.197.268-4',
          phone: '3001234567',
          status: 'verificado',
          verifiedAt: owner.verifiedAt,
        },
        reason: 'El dueño real es don Luis.',
        createdAt: report.createdAt,
      },
    ]);
    // EC-08: ni la clave de quien denunció ni la cuenta del dueño.
    expect(JSON.stringify(items)).not.toContain('clave-de-ana');
    expect(JSON.stringify(items)).not.toContain('cuenta-del-dueno');
  });

  it('un reclamo pre-aprobado muestra el comercio que espera revisión (H11), sin su cuenta ni su clave', async () => {
    const pending: MerchantClaim = { ...owner, status: 'pre_aprobado', verifiedAt: null };
    const claimCase: MerchantCase = {
      ...report,
      id: 'caso-reclamo',
      kind: 'reclamo',
      reporterKey: 'clave-de-rosa',
      reason: 'Reclamo de un supermercado: pendiente de revisión.',
    };
    const queue = new MerchantCasesQueue({
      cases: { pending: () => Promise.resolve([claimCase]) },
      claims: { findByEstablishment: () => Promise.resolve(pending) },
      establishments: { find: () => Promise.resolve({ name: 'Supermercado Laureles' }) },
    });

    const items = await queue.list();

    expect(items).toEqual([
      {
        id: 'caso-reclamo',
        kind: 'reclamo',
        establishment: { id: STORE, name: 'Supermercado Laureles' },
        owner: {
          responsibleName: 'Rosa Gómez',
          nit: '800.197.268-4',
          phone: '3001234567',
          status: 'pre_aprobado',
          verifiedAt: null,
        },
        reason: 'Reclamo de un supermercado: pendiente de revisión.',
        createdAt: report.createdAt,
      },
    ]);
    expect(JSON.stringify(items)).not.toContain('clave-de-rosa');
    expect(JSON.stringify(items)).not.toContain('cuenta-del-dueno');
  });
});
