import { isValidGtin } from './gtin';

describe('código de barras (GTIN) con dígito de control', () => {
  it('un EAN-13 con su dígito de control correcto es válido', () => {
    expect(isValidGtin('7702511000014')).toBe(true);
  });

  it('un EAN-13 con el dígito de control cambiado no es válido', () => {
    expect(isValidGtin('7702511000015')).toBe(false);
  });
});
