import { freshnessOf } from './freshness';

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;
const now = new Date('2026-11-11T12:00:00Z');
const observedAgo = (milliseconds: number): Date => new Date(now.getTime() - milliseconds);

describe('vigencia de un precio según su TTL', () => {
  it('un producto fresco (TTL 7 días) reportado hace 3 días está vigente', () => {
    expect(freshnessOf({ observedAt: observedAgo(3 * DAY), now, ttlDays: 7 })).toBe('vigente');
  });

  it('un producto no fresco (TTL 14 días) reportado hace 20 días está por confirmar', () => {
    expect(freshnessOf({ observedAt: observedAgo(20 * DAY), now, ttlDays: 14 })).toBe(
      'por_confirmar',
    );
  });

  it('un producto reportado hace más del doble de su TTL está desactualizado', () => {
    expect(freshnessOf({ observedAt: observedAgo(30 * DAY), now, ttlDays: 14 })).toBe(
      'desactualizado',
    );
  });
});
