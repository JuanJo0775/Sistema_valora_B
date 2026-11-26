import type { DomainEvent } from '../../../shared/events';
import type { MerchantCase } from './merchant-cases';
import {
  MerchantNotFoundError,
  MerchantReportOpenError,
  OwnEstablishmentError,
  ReportMerchant,
  type ReportMerchantRequest,
} from './report-merchant';

const now = new Date('2026-11-22T15:00:00Z');
const STORE = 'tienda-esperanza';

// Dobles en memoria detrás de los puertos: el dueño de cada tienda y los casos del moderador.
function setup(owners: Record<string, string> = { [STORE]: 'cuenta-del-dueno' }) {
  const cases: MerchantCase[] = [];
  const events: DomainEvent[][] = [];
  const report = new ReportMerchant({
    claims: { ownerOf: (id) => Promise.resolve(owners[id] ?? null) },
    cases: {
      hasOpen: (establishmentId, reporterKey) =>
        Promise.resolve(
          cases.some((c) => c.establishmentId === establishmentId && c.reporterKey === reporterKey),
        ),
      open: (opened, _challenger, published) => {
        cases.push(opened);
        events.push(published);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { report, cases, events };
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

  it('una tienda sin dueño no tiene comercio que denunciar', async () => {
    const { report, cases } = setup({});

    await expect(report.execute(request())).rejects.toThrow(MerchantNotFoundError);
    expect(cases).toEqual([]);
  });

  it('el dueño no denuncia su propia tienda', async () => {
    const { report, cases } = setup();

    await expect(report.execute(request({ accountId: 'cuenta-del-dueno' }))).rejects.toThrow(
      OwnEstablishmentError,
    );
    expect(cases).toEqual([]);
  });

  it('una segunda denuncia de la misma cuenta sobre la misma tienda, abierta la primera, no se acepta', async () => {
    const { report, cases } = setup();
    await report.execute(request());

    await expect(report.execute(request())).rejects.toThrow(MerchantReportOpenError);
    expect(cases).toHaveLength(1);
  });

  // H31: la consulta de elegibilidad distingue «no puede» de «ya denunció».
  describe('elegibilidad (GET merchant-reports)', () => {
    it('una cuenta ajena a una tienda con dueño puede denunciar', async () => {
      const { report } = setup();

      expect(await report.eligibility(STORE, 'cuenta-de-ana', 'clave-de-ana')).toEqual({
        canReport: true,
        alreadyReported: false,
      });
    });

    it('el dueño no puede denunciar, y no es porque ya haya denunciado', async () => {
      const { report } = setup();

      expect(await report.eligibility(STORE, 'cuenta-del-dueno', 'clave-del-dueno')).toEqual({
        canReport: false,
        alreadyReported: false,
      });
    });

    it('con una denuncia abierta sobre esa tienda, no puede denunciar y ya denunció', async () => {
      const { report } = setup();
      await report.execute(request());

      expect(await report.eligibility(STORE, 'cuenta-de-ana', 'clave-de-ana')).toEqual({
        canReport: false,
        alreadyReported: true,
      });
      expect(await report.eligibility(STORE, 'cuenta-de-luis', 'clave-de-luis')).toEqual({
        canReport: true,
        alreadyReported: false,
      });
    });

    it('una tienda sin dueño no se puede denunciar', async () => {
      const { report } = setup({});

      expect(await report.eligibility(STORE, 'cuenta-de-ana', 'clave-de-ana')).toEqual({
        canReport: false,
        alreadyReported: false,
      });
    });
  });

  // #260: moderación se entera de que hay un caso nuevo por el outbox. Solo lleva el id y el tipo
  // del caso: nada de quien denuncia (EC-08).
  it('publica MerchantCaseOpened con el id y el tipo del caso, para avisar a moderación', async () => {
    const { report, cases, events } = setup();

    await report.execute(request());

    expect(events).toEqual([
      [
        expect.objectContaining({
          type: 'MerchantCaseOpened',
          version: 1,
          payload: { caseId: cases[0]?.id, kind: 'denuncia' },
        }),
      ],
    ]);
    expect(JSON.stringify(events)).not.toContain('clave-de-ana');
  });
});
