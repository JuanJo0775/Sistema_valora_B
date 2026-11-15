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
  return { observation, flags: 0, appeal: null, discardedAt: null, ...change };
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
    labels: { of: (ids) => Promise.resolve(new Map(ids.map((id) => [id, 'Arroz Diana · 500 g']))) },
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
        productName: 'Arroz Diana · 500 g',
        establishmentName: 'Tienda Don José',
        priceCop: 2500,
        priceType: 'normal',
        observedAt: normal.observation.observedAt,
        status: 'normal',
      },
      {
        reportId: discarded.observation.reportId,
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

  it('sin aportes, la lista está vacía', async () => {
    await expect(setup([]).myReports.list('autora', {})).resolves.toEqual({ items: [] });
  });
});
