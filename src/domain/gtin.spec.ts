import { isValidGtin } from './gtin';

describe('código de barras (GTIN) con dígito de control', () => {
  it('un EAN-13 con su dígito de control correcto es válido', () => {
    expect(isValidGtin('7702511000014')).toBe(true);
  });

  it('un EAN-13 con el dígito de control cambiado no es válido', () => {
    expect(isValidGtin('7702511000015')).toBe(false);
  });

  it.each([
    ['EAN-8', '96385074'],
    ['UPC-A', '036000291452'],
    ['GTIN-14', '10614141000415'],
  ])('un %s con su dígito de control correcto es válido', (_format, code) => {
    expect(isValidGtin(code)).toBe(true);
  });

  it.each([
    ['9 dígitos', '770251100'],
    ['10 dígitos', '7702511000'],
    ['11 dígitos', '77025110000'],
    ['15 dígitos', '770251100001400'],
    ['letras', '77025110000A4'],
    ['vacío', ''],
  ])('un código de %s no es válido', (_case, code) => {
    expect(isValidGtin(code)).toBe(false);
  });
});
