import {
  assertSameBase,
  baseOf,
  calculateUnitPrice,
  compareUnitPrices,
  IncompatibleUnitsError,
  InvalidPriceError,
  InvalidQuantityError,
  MixedUnitBasesError,
} from './unit-price';

describe('precio por unidad base', () => {
  it('500 g a $4.000 equivale a $800 por 100 g', () => {
    const unitPrice = calculateUnitPrice(4000, { quantity: 500, unit: 'g' });

    expect(unitPrice.per).toBe('100g');
    expect(unitPrice.displayCop).toBe(800);
  });

  it('1 kg a $7.000 equivale a $700 por 100 g', () => {
    const unitPrice = calculateUnitPrice(7000, { quantity: 1, unit: 'kg' });

    expect(unitPrice.per).toBe('100g');
    expect(unitPrice.displayCop).toBe(700);
  });

  it('6 x 330 ml a $9.900 equivale a $500 por 100 ml', () => {
    const unitPrice = calculateUnitPrice(9900, { quantity: 330, unit: 'ml', packCount: 6 });

    expect(unitPrice.per).toBe('100ml');
    expect(unitPrice.displayCop).toBe(500);
  });

  it('1 l a $5.000 equivale a $500 por 100 ml', () => {
    const unitPrice = calculateUnitPrice(5000, { quantity: 1, unit: 'l' });

    expect(unitPrice.per).toBe('100ml');
    expect(unitPrice.displayCop).toBe(500);
  });

  it('12 unidades a $6.000 equivalen a $500 por unidad', () => {
    const unitPrice = calculateUnitPrice(6000, { quantity: 12, unit: 'und' });

    expect(unitPrice.per).toBe('und');
    expect(unitPrice.displayCop).toBe(500);
  });

  it.each([
    [4000, 300, 1333], // $1.333,33… por 100 g
    [2000, 300, 667], // $666,66… por 100 g
    [1001, 200, 501], // $500,50 por 100 g: la mitad sube
  ])('$%i por %i g se muestra redondeado al peso entero: $%i por 100 g', (price, grams, shown) => {
    expect(calculateUnitPrice(price, { quantity: grams, unit: 'g' }).displayCop).toBe(shown);
  });
});

describe('validación del precio', () => {
  it.each([0, -4000, 4000.5, Number.NaN])(
    'rechaza un precio de %p porque debe ser un entero en pesos mayor o igual a $1',
    (price) => {
      expect(() => calculateUnitPrice(price, { quantity: 500, unit: 'g' })).toThrow(
        InvalidPriceError,
      );
    },
  );
});

describe('validación de la presentación', () => {
  it.each([0, -500, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza una cantidad de %p porque debe ser mayor que cero',
    (quantity) => {
      expect(() => calculateUnitPrice(4000, { quantity, unit: 'g' })).toThrow(InvalidQuantityError);
    },
  );

  it.each([0, -2, 1.5])(
    'rechaza un empaque de %p unidades porque debe ser un entero mayor que cero',
    (packCount) => {
      expect(() => calculateUnitPrice(9900, { quantity: 330, unit: 'ml', packCount })).toThrow(
        InvalidQuantityError,
      );
    },
  );
});

describe('comparación de precios por unidad', () => {
  it('1 kg a $7.000 es más barato que 500 g a $4.000', () => {
    const kilo = calculateUnitPrice(7000, { quantity: 1, unit: 'kg' });
    const medioKilo = calculateUnitPrice(4000, { quantity: 500, unit: 'g' });

    expect(compareUnitPrices(kilo, medioKilo)).toBeLessThan(0);
    expect(compareUnitPrices(medioKilo, kilo)).toBeGreaterThan(0);
  });

  it('ordena por el valor exacto aunque los dos se muestren como $1.333 por 100 g', () => {
    const barato = calculateUnitPrice(4000, { quantity: 300, unit: 'g' }); // $1.333,33…
    const caro = calculateUnitPrice(13334, { quantity: 1, unit: 'kg' }); // $1.333,40

    expect(barato.displayCop).toBe(caro.displayCop);
    expect(compareUnitPrices(barato, caro)).toBeLessThan(0);
  });

  it.each([
    [2010, { quantity: 1.005, unit: 'kg' }, 1000, { quantity: 500, unit: 'g' }],
    [3000, { quantity: 0.3, unit: 'kg' }, 1000, { quantity: 100, unit: 'g' }],
    [6000, { quantity: 1.5, unit: 'l' }, 400, { quantity: 0.1, unit: 'l' }],
    [4000, { quantity: 500, unit: 'g', packCount: 2 }, 4000, { quantity: 1, unit: 'kg' }],
  ] as const)(
    '$%i por %o empata exactamente con $%i por %o',
    (priceA, presentationA, priceB, presentationB) => {
      const a = calculateUnitPrice(priceA, presentationA);
      const b = calculateUnitPrice(priceB, presentationB);

      expect(compareUnitPrices(a, b)).toBe(0);
    },
  );
});

describe('dimensiones incompatibles', () => {
  it.each([
    [
      { quantity: 500, unit: 'g' },
      { quantity: 500, unit: 'ml' },
    ],
    [
      { quantity: 1, unit: 'kg' },
      { quantity: 6, unit: 'und' },
    ],
    [
      { quantity: 1, unit: 'l' },
      { quantity: 12, unit: 'und' },
    ],
  ] as const)('no compara %o con %o porque no son comparables', (presentationA, presentationB) => {
    const a = calculateUnitPrice(5000, presentationA);
    const b = calculateUnitPrice(5000, presentationB);

    expect(() => compareUnitPrices(a, b)).toThrow(IncompatibleUnitsError);
  });
});

describe('cantidades que JavaScript escribe en notación exponencial', () => {
  it('0,0000005 kg a $1 equivale a $200.000 por 100 g', () => {
    expect(calculateUnitPrice(1, { quantity: 0.0000005, unit: 'kg' }).displayCop).toBe(200000);
  });

  it('2 × 10^21 g a $2.000 equivale a $0 por 100 g', () => {
    expect(calculateUnitPrice(2000, { quantity: 2e21, unit: 'g' }).displayCop).toBe(0);
  });
});

// Issue #59: un producto representa una sola cosa; sus presentaciones comparten la base.
describe('base de unidad de un producto', () => {
  it('g y kg se comparan por 100 g; ml y l por 100 ml; und por unidad', () => {
    expect((['g', 'kg', 'ml', 'l', 'und'] as const).map(baseOf)).toEqual([
      '100g',
      '100g',
      '100ml',
      '100ml',
      'und',
    ]);
  });

  it('presentaciones en g y kg comparten la base', () => {
    expect(() => {
      assertSameBase(['g', 'kg', 'g']);
    }).not.toThrow();
  });

  it('presentaciones en g y und mezclan bases y se rechazan', () => {
    expect(() => {
      assertSameBase(['g', 'und']);
    }).toThrow(MixedUnitBasesError);
  });
});
