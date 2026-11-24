import {
  assertOfficialPriceInRange,
  assertPlausiblePrice,
  assertPromotionPriceInRange,
  assessAgainstFallback,
  assessOfficialPrice,
  assessPromotionPrice,
  ImplausibleOfficialPriceError,
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

// ADR-037: la misma referencia y los mismos parámetros del ADR-030, aplicados al precio oficial.
describe('precio oficial frente a la referencia (ADR-037)', () => {
  const peers = { peerPricesCop: [3950, 4200, 4600] };
  const rejection = (
    priceCop: number,
    verdict: ReturnType<typeof assessOfficialPrice>,
  ): unknown => {
    try {
      assertOfficialPriceInRange(priceCop, verdict);
      return undefined;
    } catch (error) {
      return error;
    }
  };

  it('dentro de rango con la mediana de al menos 3 tiendas: se publica', () => {
    expect(assessOfficialPrice(4300, peers)).toEqual({ status: 'dentro_de_rango' });
    expect(assertOfficialPriceInRange(4300, assessOfficialPrice(4300, peers))).toBe(
      'dentro_de_rango',
    );
  });

  // Mediana 4.200: el límite exacto es normal (40 % = 1.680; 250 % = 10.500).
  it.each([1680, 10_500])('$%i, el límite exacto, es normal', (priceCop) => {
    expect(assessOfficialPrice(priceCop, peers).status).toBe('dentro_de_rango');
  });

  it.each([1679, 10_501, 300, 52_000])(
    '$%i queda fuera de rango y el 422 dice lo más barato y lo más caro',
    (priceCop) => {
      const verdict = assessOfficialPrice(priceCop, peers);

      expect(verdict).toEqual({
        status: 'fuera_de_rango',
        reference: 'tiendas',
        lowestCop: 3950,
        highestCop: 4600,
        wholesaleCop: null,
      });
      const error = rejection(priceCop, verdict);
      expect(error).toBeInstanceOf(ImplausibleOfficialPriceError);
      expect(error).toMatchObject({
        code: 'IMPLAUSIBLE_OFFICIAL_PRICE',
        message: expect.stringContaining(
          'Lo más barato que vemos es $3.950 y lo más caro $4.600',
        ) as unknown,
      });
    },
  );

  it('con menos de 3 tiendas y sin SIPSA no hay referencia: sin_referencia, no se rechaza', () => {
    const verdict = assessOfficialPrice(300, { peerPricesCop: [3950, 4200] });

    expect(verdict).toEqual({ status: 'sin_referencia' });
    expect(assertOfficialPriceInRange(300, verdict)).toBe('sin_referencia');
  });

  it('con SIPSA y sin tiendas suficientes: menos del 50 % del mayorista se rechaza; el resto, no', () => {
    const fallback = { peerPricesCop: [], wholesaleTotalCop: 3000 };

    expect(assessOfficialPrice(1500, fallback).status).toBe('dentro_de_rango');
    expect(assessOfficialPrice(52_000, fallback).status).toBe('dentro_de_rango');
    const verdict = assessOfficialPrice(1499, fallback);
    expect(verdict).toEqual({
      status: 'fuera_de_rango',
      reference: 'sipsa',
      lowestCop: 3000,
      highestCop: null,
      wholesaleCop: 3000,
    });
    expect(rejection(1499, verdict)).toMatchObject({
      code: 'IMPLAUSIBLE_OFFICIAL_PRICE',
      message: expect.stringContaining('$3.000') as unknown,
    });
  });

  it('usa los parámetros que se le pasen', () => {
    const strict = { ...PLAUSIBILITY_PARAMS, lowRatio: 0.9 };

    expect(assessOfficialPrice(3500, peers, strict).status).toBe('fuera_de_rango');
  });
});

describe('precio de una promoción frente a la referencia (ADR-037)', () => {
  const peers = { peerPricesCop: [3950, 4200, 4600] };

  it('solo vigila el lado bajo: menos del 40 % de la mediana (1.680) se rechaza', () => {
    expect(assessPromotionPrice(1680, peers).status).toBe('dentro_de_rango');
    expect(assessPromotionPrice(1679, peers).status).toBe('fuera_de_rango');
    expect(assessPromotionPrice(52_000, peers).status).toBe('dentro_de_rango');
  });

  it('sin referencia, no la frena', () => {
    expect(assessPromotionPrice(150, { peerPricesCop: [] })).toEqual({ status: 'sin_referencia' });
  });

  it('con SIPSA mide contra el 50 % del mayorista', () => {
    const fallback = { peerPricesCop: [], wholesaleTotalCop: 3000 };

    expect(assessPromotionPrice(1500, fallback).status).toBe('dentro_de_rango');
    expect(assessPromotionPrice(1499, fallback).status).toBe('fuera_de_rango');
  });

  it('el 422 explica la promoción y cómo corregirla', () => {
    const verdict = assessPromotionPrice(1000, peers);

    expect(() => {
      assertPromotionPriceInRange(1000, verdict);
    }).toThrow(ImplausibleOfficialPriceError);
    expect(() => {
      assertPromotionPriceInRange(1000, verdict);
    }).toThrow(
      /Con esta promoción el precio quedaría en \$1\.000.*\$3\.950 y lo más caro \$4\.600.*Sube el precio especial o baja el descuento/,
    );
    expect(() => {
      assertPromotionPriceInRange(1000, assessPromotionPrice(1000, { peerPricesCop: [] }));
    }).not.toThrow();
  });
});
