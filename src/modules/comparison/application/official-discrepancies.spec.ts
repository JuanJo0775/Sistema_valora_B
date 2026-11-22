import type { OfficialPriceCopy } from './official-price-copies';
import { OfficialDiscrepancies } from './official-discrepancies';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-22T15:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const STORE = 'tienda-esperanza';

// El comercio cambió sus dos precios hace 3 días.
const official = (presentationId: string, priceCop: number): OfficialPriceCopy => ({
  presentationId,
  establishmentId: STORE,
  priceCop,
  confirmedAt: daysAgo(1),
  priceChangedAt: daysAgo(3),
});

// B9 (#209) con D1 y ADR-008: el comercio recibe un aviso cuando la comunidad corrobora otro precio.
describe('discrepancias corroboradas de una tienda (consulta pública de comparison)', () => {
  it('solo las presentaciones con discrepancia, con el oficial, la mediana y desde cuándo', async () => {
    const discrepancies = new OfficialDiscrepancies({
      officials: {
        findByEstablishment: () =>
          Promise.resolve([official('arroz', 4000), official('aceite', 9000)]),
      },
      reliability: {
        reportsAt: (presentationId) =>
          Promise.resolve(
            presentationId === 'arroz'
              ? [
                  {
                    reportId: 'r1',
                    priceCop: 4800,
                    observedAt: daysAgo(2),
                    level: 'alta' as const,
                  },
                  {
                    reportId: 'r2',
                    priceCop: 4700,
                    observedAt: daysAgo(1),
                    level: 'media' as const,
                  },
                ]
              : [],
          ),
      },
      presentations: { isFresh: () => Promise.resolve(false) },
      clock: { now: () => now },
    });

    await expect(discrepancies.of(STORE)).resolves.toEqual([
      {
        presentationId: 'arroz',
        officialPriceCop: 4000,
        reportedPriceCop: 4700,
        reports: 2,
        since: daysAgo(2),
      },
    ]);
  });
});
