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
});
