import { savingsPercent } from './savings';
import { calculateUnitPrice } from './unit-price';

const KILO = { quantity: 1, unit: 'kg' } as const;

// Un precio vigente de una tienda, por kilo.
const at = (establishmentId: string, priceCop: number, presentation = KILO) => ({
  establishmentId,
  unitPrice: calculateUnitPrice(priceCop, presentation),
});

describe('ahorro frente a la tienda más cara (B#128)', () => {
  it('arroz a $3.890 y a $4.580 el kilo: hasta 15 % menos', () => {
    expect(savingsPercent([at('ara', 3890), at('d1', 4580)])).toBe(15);
  });

  it('compara el más barato con el más caro, aunque haya tiendas en medio', () => {
    // De $4.000 a $5.000 el kilo: (5.000 − 4.000) / 5.000 = 20 %.
    expect(savingsPercent([at('a', 4500), at('b', 5000), at('c', 4000)])).toBe(20);
  });

  it('redondea al entero más cercano, la mitad hacia arriba', () => {
    // De $1.000 a $1.010: 0,99 % → 1 %. De $195 a $200: 2,5 % → 3 %.
    expect(savingsPercent([at('a', 1000), at('b', 1010)])).toBe(1);
    expect(savingsPercent([at('a', 195), at('b', 200)])).toBe(3);
  });

  it('compara por precio por unidad, no por precio total', () => {
    // 500 g a $2.000 ($400 por 100 g) frente a 1 kg a $5.000 ($500 por 100 g): 20 % menos.
    const halfKilo = { quantity: 500, unit: 'g' } as const;
    expect(savingsPercent([at('a', 2000, halfKilo), at('b', 5000)])).toBe(20);
  });

  it('con el mismo precio en todas las tiendas el ahorro es 0 %', () => {
    expect(savingsPercent([at('a', 4000), at('b', 4000)])).toBe(0);
  });

  it('con una sola tienda no hay con qué comparar', () => {
    // Dos presentaciones en la misma tienda siguen siendo una tienda.
    const halfKilo = { quantity: 500, unit: 'g' } as const;
    expect(savingsPercent([at('ara', 3890)])).toBeUndefined();
    expect(savingsPercent([at('ara', 3890), at('ara', 2500, halfKilo)])).toBeUndefined();
    expect(savingsPercent([])).toBeUndefined();
  });

  it('si los precios no se pueden comparar (100 g frente a unidad) no hay ahorro', () => {
    const dozen = { quantity: 12, unit: 'und' } as const;
    expect(savingsPercent([at('a', 3890), at('b', 6000, dozen)])).toBeUndefined();
  });
});
