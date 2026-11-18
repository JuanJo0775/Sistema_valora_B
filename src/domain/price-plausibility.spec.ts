import {
  assertPlausiblePrice,
  assessAgainstFallback,
  ImplausiblePriceError,
  PLAUSIBILITY_PARAMS,
  wholesaleTotalCop,
} from './price-plausibility';

describe('piso y techo absolutos', () => {
  const rejection = (priceCop: number, params = PLAUSIBILITY_PARAMS): unknown => {
    try {
      assertPlausiblePrice(priceCop, params);
      return undefined;
    } catch (error) {
      return error;
    }
  };

  it.each([1, 12, 50, 99])('rechaza $%i por parecer incompleto', (priceCop) => {
    const error = rejection(priceCop);

    expect(error).toBeInstanceOf(ImplausiblePriceError);
    expect(error).toMatchObject({
      code: 'IMPLAUSIBLE_PRICE',
      message:
        'El precio parece incompleto: ningún producto cuesta menos de $100. Revisa si faltan ceros.',
    });
  });

  it.each([100, 1990, 5_000_000])('acepta $%i', (priceCop) => {
    expect(rejection(priceCop)).toBeUndefined();
  });

  it('rechaza más de $5.000.000 con un mensaje de ceros de más', () => {
    const error = rejection(5_000_001);

    expect(error).toBeInstanceOf(ImplausiblePriceError);
    expect(error).toMatchObject({ message: expect.stringContaining('sobran ceros') as string });
  });

  it('los valores se pueden reemplazar al llamar', () => {
    const params = { ...PLAUSIBILITY_PARAMS, minPriceCop: 500 };

    expect(rejection(499, params)).toBeInstanceOf(ImplausiblePriceError);
    expect(rejection(500, params)).toBeUndefined();
  });
});

describe('referencia por otras tiendas del municipio', () => {
  const peers = [1900, 1990, 2100];

  it('con menos de 3 tiendas no evalúa', () => {
    expect(assessAgainstFallback(12, { peerPricesCop: [1990, 1990] })).toBeNull();
  });

  it('usa la mediana del precio total y dice que la referencia son las tiendas', () => {
    expect(assessAgainstFallback(1990, { peerPricesCop: peers })).toEqual({
      status: 'normal',
      reference: 'tiendas',
      median: 1990,
      deviation: 0,
      references: 3,
    });
  });

  it('$12 frente a 1.990 es sospechoso por rango', () => {
    expect(assessAgainstFallback(12, { peerPricesCop: peers })).toMatchObject({
      status: 'sospechoso',
      reason: 'rango',
      reference: 'tiendas',
      median: 1990,
      references: 3,
    });
  });

  // Mediana 1000: los límites son 400 y 2500.
  const thousand = { peerPricesCop: [900, 1000, 1100] };
  it.each([
    ['39 %', 390, 'sospechoso'],
    ['40 %', 400, 'normal'],
    ['250 %', 2500, 'normal'],
    ['251 %', 2510, 'sospechoso'],
  ])('un precio al %s de la mediana es %s', (_case, priceCop, status) => {
    expect(assessAgainstFallback(priceCop, thousand)?.status).toBe(status);
  });

  it('con un número par de tiendas usa el promedio de las dos del medio', () => {
    expect(assessAgainstFallback(1000, { peerPricesCop: [800, 900, 1100, 1200] })?.median).toBe(
      1000,
    );
  });

  it('la desviación es la distancia relativa a la mediana', () => {
    expect(assessAgainstFallback(390, thousand)).toMatchObject({ deviation: 0.61 });
  });

  it('si hay tiendas suficientes no mira SIPSA', () => {
    const result = assessAgainstFallback(1000, { ...thousand, wholesaleTotalCop: 5000 });
    expect(result).toMatchObject({ status: 'normal', reference: 'tiendas' });
  });
});

describe('referencia mayorista SIPSA', () => {
  const sipsa = { peerPricesCop: [], wholesaleTotalCop: 2000 };

  it('sin tiendas suficientes ni SIPSA no se puede evaluar', () => {
    expect(assessAgainstFallback(12, { peerPricesCop: [1990] })).toBeNull();
    expect(assessAgainstFallback(12, { peerPricesCop: [], wholesaleTotalCop: null })).toBeNull();
  });

  it.each([
    ['49 %', 980, 'sospechoso'],
    ['50 %', 1000, 'normal'],
    ['300 %', 6000, 'normal'],
  ])('un precio minorista al %s del mayorista es %s', (_case, priceCop, status) => {
    expect(assessAgainstFallback(priceCop, sipsa)?.status).toBe(status);
  });

  it('el resultado dice que la referencia es SIPSA y lleva el total del mayorista', () => {
    expect(assessAgainstFallback(900, sipsa)).toEqual({
      status: 'sospechoso',
      reason: 'rango',
      reference: 'sipsa',
      median: 2000,
      deviation: 0.55,
      references: 1,
    });
  });
});

describe('referencia mayorista de una presentación', () => {
  it('1 kg a $2.000 por kilo son $2.000', () => {
    expect(wholesaleTotalCop(2000, { quantity: 1, unit: 'kg' })).toBe(2000);
  });

  it('500 g son la mitad', () => {
    expect(wholesaleTotalCop(2000, { quantity: 500, unit: 'g' })).toBe(1000);
  });

  it('un empaque de 3 × 500 g son 1,5 kg', () => {
    expect(wholesaleTotalCop(2000, { quantity: 500, unit: 'g', packCount: 3 })).toBe(3000);
  });

  it('redondea al peso', () => {
    expect(wholesaleTotalCop(1999, { quantity: 250, unit: 'g' })).toBe(500);
  });

  it.each(['ml', 'l', 'und'] as const)('una presentación en %s no tiene referencia', (unit) => {
    expect(wholesaleTotalCop(2000, { quantity: 1, unit })).toBeNull();
  });
});
