import { initialPriceAction } from './initial-price';

describe('dato inicial frente al precio vigente de una tienda', () => {
  it('sin precio en la tienda, el dato inicial entra', () => {
    expect(initialPriceAction(undefined)).toBe('insert');
  });

  it('nunca reemplaza un precio que vio la comunidad', () => {
    expect(initialPriceAction({ source: 'comunidad' })).toBe('keep');
  });

  it('sobre otro dato inicial se actualiza, para que repetir la semilla no duplique', () => {
    expect(initialPriceAction({ source: 'siembra' })).toBe('update');
  });
});
