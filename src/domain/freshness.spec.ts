import { freshnessOf, InvalidObservationDateError } from './freshness';

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

describe('límites de la vigencia (TTL de 7 días)', () => {
  it.each([
    ['exactamente 7 días', 7 * DAY, 'vigente'],
    ['7 días y 1 segundo', 7 * DAY + SECOND, 'por_confirmar'],
    ['exactamente 14 días', 14 * DAY, 'por_confirmar'],
    ['14 días y 1 segundo', 14 * DAY + SECOND, 'desactualizado'],
  ] as const)('reportado hace %s está %s', (_label, age, expected) => {
    expect(freshnessOf({ observedAt: observedAgo(age), now, ttlDays: 7 })).toBe(expected);
  });
});

describe('fecha de observación inválida', () => {
  it('rechaza una fecha de observación posterior al momento actual', () => {
    const inTheFuture = new Date(now.getTime() + SECOND);

    expect(() => freshnessOf({ observedAt: inTheFuture, now, ttlDays: 7 })).toThrow(
      InvalidObservationDateError,
    );
  });

  it('rechaza una fecha de observación que no es una fecha válida', () => {
    expect(() => freshnessOf({ observedAt: new Date('no es una fecha'), now, ttlDays: 7 })).toThrow(
      InvalidObservationDateError,
    );
  });
});
