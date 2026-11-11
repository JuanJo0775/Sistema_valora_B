import { calculateUnitPrice } from './unit-price';

describe('precio por unidad base', () => {
  it('500 g a $4.000 equivale a $800 por 100 g', () => {
    const unitPrice = calculateUnitPrice(4000, { quantity: 500, unit: 'g' });

    expect(unitPrice.per).toBe('100g');
    expect(unitPrice.displayCop).toBe(800);
  });
});
