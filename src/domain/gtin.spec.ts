import { isValidGtin } from './gtin';

describe('código de barras (GTIN) con dígito de control', () => {
  it('un EAN-13 con su dígito de control correcto es válido', () => {
    expect(isValidGtin('7702511000014')).toBe(true);
  });
});
