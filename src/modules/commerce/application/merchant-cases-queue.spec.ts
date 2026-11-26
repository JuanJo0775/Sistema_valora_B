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
        // H18: una sola denuncia abierta de una sola cuenta.
        reportCount: 1,
        distinctReporters: 1,
        firstReportedAt: report.createdAt,
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

  // H18: el moderador decide con las dos partes a la vista.
  it('una disputa trae a quien disputa (responsable, teléfono, NIT y fecha); nunca su cuenta ni su clave', async () => {
    const dispute: MerchantCase = {
      ...report,
      id: 'caso-disputa',
      kind: 'disputa',
      reporterKey: 'clave-de-luis',
      reason: 'Otra cuenta, estando en la tienda, intentó registrarla.',
      createdAt: new Date('2026-11-23T09:30:00Z'),
      challenger: { responsibleName: 'Luis Ramírez', nit: '900.123.456-8', phone: '3157654321' },
    };
    const queue = new MerchantCasesQueue({
      cases: { pending: () => Promise.resolve([dispute]) },
      claims: { findByEstablishment: () => Promise.resolve(owner) },
      establishments: { find: () => Promise.resolve({ name: 'Tienda La Esperanza' }) },
    });

    const [item] = await queue.list();

    expect(item).toMatchObject({
      kind: 'disputa',
      owner: { responsibleName: 'Rosa Gómez' },
      challenger: {
        responsibleName: 'Luis Ramírez',
        phone: '3157654321',
        nit: '900.123.456-8',
        requestedAt: dispute.createdAt,
      },
    });
    expect(item).not.toHaveProperty('reportCount');
    const text = JSON.stringify(item);
    expect(text).not.toContain('clave-de-luis');
    expect(text).not.toContain('cuenta-del-dueno');
  });

  it('el NIT de quien disputa solo viene si lo dio (tienda informal)', async () => {
    const dispute: MerchantCase = {
      ...report,
      kind: 'disputa',
      challenger: { responsibleName: 'Luis Ramírez', nit: null, phone: '3157654321' },
    };
    const queue = new MerchantCasesQueue({
      cases: { pending: () => Promise.resolve([dispute]) },
      claims: { findByEstablishment: () => Promise.resolve(owner) },
      establishments: { find: () => Promise.resolve({ name: 'Tienda La Esperanza' }) },
    });

    const [item] = await queue.list();

    expect(item?.challenger).toEqual({
      responsibleName: 'Luis Ramírez',
      phone: '3157654321',
      requestedAt: dispute.createdAt,
    });
    expect(item?.challenger).not.toHaveProperty('nit');
  });

  it('una disputa anterior a guardar estos datos sale con challenger null', async () => {
    const queue = new MerchantCasesQueue({
      cases: { pending: () => Promise.resolve([{ ...report, kind: 'disputa' }]) },
      claims: { findByEstablishment: () => Promise.resolve(owner) },
      establishments: { find: () => Promise.resolve({ name: 'Tienda La Esperanza' }) },
    });

    const [item] = await queue.list();

    expect(item).toMatchObject({ kind: 'disputa', challenger: null });
  });

  it('una denuncia dice cuántas denuncias abiertas lleva la tienda y cuántas cuentas distintas, sin identificar a nadie', async () => {
    const cases: MerchantCase[] = [
      {
        ...report,
        id: 'd1',
        reporterKey: 'clave-de-ana',
        createdAt: new Date('2026-11-22T15:00:00Z'),
      },
      {
        ...report,
        id: 'd2',
        reporterKey: 'clave-de-beto',
        createdAt: new Date('2026-11-20T08:00:00Z'),
      },
      // La misma clave dos veces (casos viejos): cuenta como una sola cuenta distinta.
      {
        ...report,
        id: 'd3',
        reporterKey: 'clave-de-beto',
        createdAt: new Date('2026-11-23T08:00:00Z'),
      },
      // Otra tienda, y una disputa de la misma tienda: no suman.
      { ...report, id: 'd4', establishmentId: 'tienda-otra', reporterKey: 'clave-de-carla' },
      { ...report, id: 'd5', kind: 'disputa', reporterKey: 'clave-de-luis' },
    ];
    const queue = new MerchantCasesQueue({
      cases: { pending: () => Promise.resolve(cases) },
      claims: { findByEstablishment: () => Promise.resolve(owner) },
      establishments: { find: () => Promise.resolve({ name: 'Tienda' }) },
    });

    const items = await queue.list();

    const stats = (id: string) => {
      const found = items.find((item) => item.id === id);
      return {
        reportCount: found?.reportCount,
        distinctReporters: found?.distinctReporters,
        firstReportedAt: found?.firstReportedAt,
      };
    };
    for (const id of ['d1', 'd2', 'd3']) {
      expect(stats(id)).toEqual({
        reportCount: 3,
        distinctReporters: 2,
        firstReportedAt: new Date('2026-11-20T08:00:00Z'),
      });
    }
    expect(stats('d4')).toMatchObject({ reportCount: 1, distinctReporters: 1 });
    expect(items.find((item) => item.id === 'd5')).not.toHaveProperty('reportCount');
    expect(JSON.stringify(items)).not.toMatch(/clave-de-/);
  });

  it('un reclamo no cambia: el comercio que espera revisión ya es el solicitante (owner)', async () => {
    const queue = new MerchantCasesQueue({
      cases: { pending: () => Promise.resolve([{ ...report, kind: 'reclamo' }]) },
      claims: {
        findByEstablishment: () =>
          Promise.resolve({ ...owner, status: 'pre_aprobado', verifiedAt: null }),
      },
      establishments: { find: () => Promise.resolve({ name: 'Supermercado Laureles' }) },
    });

    const [item] = await queue.list();

    expect(item).not.toHaveProperty('challenger');
    expect(item).not.toHaveProperty('reportCount');
  });
});

// #257: el número de la pestaña «Comercios» del panel de moderación.
describe('cuántos casos de comercios esperan decisión (#257)', () => {
  const queueWith = (pending: MerchantCase[]) =>
    new MerchantCasesQueue({
      cases: { pending: () => Promise.resolve(pending) },
      claims: { findByEstablishment: () => Promise.resolve(null) },
      establishments: { find: () => Promise.resolve(null) },
    });

  it('sin casos son cero', async () => {
    await expect(queueWith([]).count()).resolves.toBe(0);
  });

  // ADR-038: un reclamo de un supermercado pasa por la misma cola que las denuncias y las disputas.
  it('cuenta juntas las denuncias, las disputas y los reclamos', async () => {
    const queue = queueWith([
      report,
      { ...report, id: 'caso-2', kind: 'disputa' },
      { ...report, id: 'caso-3', kind: 'reclamo' },
    ]);

    await expect(queue.count()).resolves.toBe(3);
  });
});
