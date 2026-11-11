import { calculateUnitPrice } from './unit-price';

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
