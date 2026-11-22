import {
  assertValidDates,
  assertValidOffer,
  InvalidPromotionError,
  type PromotionOffer,
  promotedPriceCop,
  promotionStatus,
} from './promotion';

// 22 de noviembre de 2026, 10:00 a. m. en Colombia (UTC-5).
const now = new Date('2026-11-22T15:00:00Z');
const week = { validFrom: '2026-11-20', validUntil: '2026-11-27' };

describe('estado de una promoción (D6 del grill comercial, ADR-009)', () => {
  it('dentro de sus fechas y con el oficial vigente, está activa', () => {
    expect(promotionStatus({ ...week, now, officialFreshness: 'vigente' })).toBe('activa');
  });

  // D6: el «antes» debe ser un precio real y reciente; reconfirmar el oficial la reactiva.
  it.each(['por_confirmar', 'desactualizado'] as const)(
    'con el oficial %s, la promoción se pausa sola',
    (officialFreshness) => {
      expect(promotionStatus({ ...week, now, officialFreshness })).toBe('pausada');
    },
  );

  it('después de su último día está vencida, aunque el oficial esté vigente o no', () => {
    const ended = { validFrom: '2026-11-15', validUntil: '2026-11-21' };

    expect(promotionStatus({ ...ended, now, officialFreshness: 'vigente' })).toBe('vencida');
    expect(promotionStatus({ ...ended, now, officialFreshness: 'por_confirmar' })).toBe('vencida');
  });

  it('antes de su primer día está programada', () => {
    const weekend = { validFrom: '2026-11-28', validUntil: '2026-11-29' };

    expect(promotionStatus({ ...weekend, now, officialFreshness: 'vigente' })).toBe('programada');
  });

  // Colombia está en UTC-5: las 11:30 p. m. del 27 en Colombia ya son el 28 en UTC.
  it('el último día cuenta completo en hora de Colombia', () => {
    const lastNight = new Date('2026-11-28T04:30:00Z');

    expect(promotionStatus({ ...week, now: lastNight, officialFreshness: 'vigente' })).toBe(
      'activa',
    );
  });
});

describe('precio con la promoción, a partir del oficial (D6)', () => {
  it('20 % de descuento sobre $2.600 deja $2.080', () => {
    expect(promotedPriceCop({ type: 'descuento_porcentual', percent: 20 }, 2600)).toBe(2080);
  });

  it('un precio especial de $2.300 es ese precio', () => {
    expect(promotedPriceCop({ type: 'precio_especial', specialPriceCop: 2300 }, 2600)).toBe(2300);
  });

  it('pague 2 lleve 3 de $2.600 deja cada unidad en $1.733', () => {
    expect(promotedPriceCop({ type: 'pague_x_lleve_y', payX: 2, takeY: 3 }, 2600)).toBe(1733);
  });
});

describe('límites de cada tipo de promoción (D6, EC-06)', () => {
  it.each<PromotionOffer>([
    { type: 'descuento_porcentual', percent: 1 },
    { type: 'descuento_porcentual', percent: 90 },
    { type: 'precio_especial', specialPriceCop: 2599 },
    { type: 'pague_x_lleve_y', payX: 1, takeY: 2 },
  ])('se acepta %o con un oficial de $2.600', (offer) => {
    expect(() => {
      assertValidOffer(offer, 2600);
    }).not.toThrow();
  });

  it.each<[string, PromotionOffer]>([
    ['un descuento de 0 %', { type: 'descuento_porcentual', percent: 0 }],
    ['un descuento de más de 90 %', { type: 'descuento_porcentual', percent: 91 }],
    ['un descuento con decimales', { type: 'descuento_porcentual', percent: 12.5 }],
    ['un precio especial igual al oficial', { type: 'precio_especial', specialPriceCop: 2600 }],
    ['un precio especial de menos de $100', { type: 'precio_especial', specialPriceCop: 99 }],
    ['pague 3 lleve 3', { type: 'pague_x_lleve_y', payX: 3, takeY: 3 }],
    ['pague 0 lleve 2', { type: 'pague_x_lleve_y', payX: 0, takeY: 2 }],
  ])('se rechaza %s', (_case, offer) => {
    expect(() => {
      assertValidOffer(offer, 2600);
    }).toThrow(InvalidPromotionError);
  });
});

describe('fechas de una promoción (D6, precisiones del 22-nov)', () => {
  it('se acepta de hoy a 29 días después: 30 días contando los dos extremos', () => {
    expect(() => {
      assertValidDates({ validFrom: '2026-11-22', validUntil: '2026-12-21', now });
    }).not.toThrow();
  });

  it.each([
    ['más de 30 días', '2026-11-22', '2026-12-22'],
    ['un final antes del inicio', '2026-11-25', '2026-11-24'],
    ['un final que ya pasó', '2026-11-15', '2026-11-21'],
  ])('se rechaza %s', (_case, validFrom, validUntil) => {
    expect(() => {
      assertValidDates({ validFrom, validUntil, now });
    }).toThrow(InvalidPromotionError);
  });
});
