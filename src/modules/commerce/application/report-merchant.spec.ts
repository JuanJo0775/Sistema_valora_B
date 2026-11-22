import type { MerchantCase } from './merchant-cases';
import { ReportMerchant, type ReportMerchantRequest } from './report-merchant';

const now = new Date('2026-11-22T15:00:00Z');
const STORE = 'tienda-esperanza';

// Dobles en memoria detrás de los puertos: el dueño de cada tienda y los casos del moderador.
function setup(owners: Record<string, string> = { [STORE]: 'cuenta-del-dueno' }) {
  const cases: MerchantCase[] = [];
  const report = new ReportMerchant({
    claims: { ownerOf: (id) => Promise.resolve(owners[id] ?? null) },
    cases: {
      hasOpen: (establishmentId, reporterKey) =>
        Promise.resolve(
          cases.some((c) => c.establishmentId === establishmentId && c.reporterKey === reporterKey),
        ),
      open: (opened) => {
        cases.push(opened);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { report, cases };
}

const request = (change: Partial<ReportMerchantRequest> = {}): ReportMerchantRequest => ({
  establishmentId: STORE,
  accountId: 'cuenta-de-ana',
  reporterKey: 'clave-de-ana',
  reason: '  El dueño real de la tienda es don Luis, no esta persona.  ',
  ...change,
});

describe('denunciar un comercio (D2 y D3 del grill comercial)', () => {
  it('queda un caso pendiente para el moderador, con la clave seudónima de quien denuncia', async () => {
    const { report, cases } = setup();

    const result = await report.execute(request());

    expect(result).toEqual({ id: cases[0]?.id, status: 'pendiente' });
    expect(cases).toEqual([
      {
        id: expect.any(String) as unknown,
        establishmentId: STORE,
        kind: 'denuncia',
        reporterKey: 'clave-de-ana',
        reason: 'El dueño real de la tienda es don Luis, no esta persona.',
        createdAt: now,
      },
    ]);
  });
});
