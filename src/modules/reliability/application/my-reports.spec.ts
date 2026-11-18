import { MyReports } from './my-reports';
import type { AuthoredPage, AuthoredReport, Observation } from './stores';

const now = new Date('2026-11-15T14:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

let sequence = 0;
const authored = (change: Partial<AuthoredReport> = {}, at = hoursAgo(1)): AuthoredReport => {
  sequence += 1;
  const observation: Observation = {
    reportId: `reporte-${String(sequence)}`,
    presentationId: 'arroz-500g',
    establishmentId: 'don-jose',
    reporterKey: 'autora',
    reporterSince: new Date('2025-01-01'),
    priceCop: 2500,
    priceType: 'normal',
    observedAt: at,
    receivedAt: at,
    verdict: { status: 'normal', median: 2500, deviation: 0, references: 3 },
  };
  return { observation, flags: 0, appeal: null, discardedAt: null, burst: false, ...change };
};

function setup(stored: AuthoredReport[]) {
  const pages: AuthoredPage[] = [];
  const myReports = new MyReports({
    moderation: {
      authoredBy: (_key, page) => {
        pages.push(page);
        return Promise.resolve(
          stored
            .filter((report) => !page.before || report.observation.receivedAt < page.before)
            .slice(0, page.limit),
        );
      },
    },
    presentations: {
      of: (ids) =>
        Promise.resolve(
          new Map(
            ids.map((id) => [id, { label: 'Arroz Diana · 500 g', productId: 'producto-arroz' }]),
          ),
        ),
    },
    names: { of: (ids) => Promise.resolve(new Map(ids.map((id) => [id, 'Tienda Don José']))) },
    clock: { now: () => now },
  });
  return { pages, myReports };
}

describe('mis aportes con su estado (RF-006, grill de la #76)', () => {
  it('cada aporte trae su producto, su tienda, su precio, su estado y hasta cuándo se puede apelar', async () => {
    const normal = authored();
    const discarded = authored({ discardedAt: hoursAgo(2) }, hoursAgo(3));
    discarded.observation.moderation = 'descartado';
    const { myReports } = setup([normal, discarded]);

    const page = await myReports.list('autora', {});

    expect(page.items).toEqual([
      {
        reportId: normal.observation.reportId,
        productId: 'producto-arroz',
        productName: 'Arroz Diana · 500 g',
        establishmentName: 'Tienda Don José',
        priceCop: 2500,
        priceType: 'normal',
        observedAt: normal.observation.observedAt,
        status: 'normal',
      },
      {
        reportId: discarded.observation.reportId,
        productId: 'producto-arroz',
        productName: 'Arroz Diana · 500 g',
        establishmentName: 'Tienda Don José',
        priceCop: 2500,
        priceType: 'normal',
        observedAt: discarded.observation.observedAt,
        status: 'descartado',
        appealableUntil: new Date(hoursAgo(2).getTime() + 7 * 24 * 3_600_000),
      },
    ]);
  });

  // Grill de la #29, pregunta 3: un reporte de una ráfaga espera la decisión del moderador.
  it('un aporte que llegó en una ráfaga está en revisión', async () => {
    const { myReports } = setup([authored({ burst: true })]);

    const page = await myReports.list('autora', {});

    expect(page.items.map((item) => item.status)).toEqual(['en_revision']);
  });

  it('si la presentación ya no existe, el aporte sale sin productId y con «Sin nombre»', async () => {
    const myReports = new MyReports({
      moderation: { authoredBy: () => Promise.resolve([authored()]) },
      presentations: { of: () => Promise.resolve(new Map()) },
      names: { of: () => Promise.resolve(new Map()) },
      clock: { now: () => now },
    });

    const page = await myReports.list('autora', {});

    expect(page.items[0]).not.toHaveProperty('productId');
    expect(page.items[0]).toMatchObject({
      productName: 'Sin nombre',
      establishmentName: 'Sin nombre',
    });
  });

  it('sin aportes, la lista está vacía', async () => {
    await expect(setup([]).myReports.list('autora', {})).resolves.toEqual({ items: [] });
  });

  describe('paginación', () => {
    // 25 aportes, uno por hora: el primero es el más reciente.
    const many = Array.from({ length: 25 }, (_, index) => authored({}, hoursAgo(index + 1)));

    it('trae 20 por defecto y dice desde dónde pedir los siguientes', async () => {
      const { pages, myReports } = setup(many);

      const page = await myReports.list('autora', {});

      expect(page.items).toHaveLength(20);
      expect(page.nextBefore).toEqual(many[19]?.observation.receivedAt);
      expect(pages).toEqual([{ limit: 20 }]);
    });

    it('con before trae los anteriores; la última página no dice nextBefore', async () => {
      const { myReports } = setup(many);
      const first = await myReports.list('autora', { limit: 20 });

      const second = await myReports.list('autora', {
        limit: 20,
        ...(first.nextBefore ? { before: first.nextBefore } : {}),
      });

      expect(second.items.map((item) => item.reportId)).toEqual(
        many.slice(20).map((report) => report.observation.reportId),
      );
      expect(second).not.toHaveProperty('nextBefore');
    });
  });
});
