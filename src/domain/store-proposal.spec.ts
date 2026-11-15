import { equivalentStoreNames } from './store-proposal';

describe('nombres de tienda equivalentes (RF-005 RN3, grill de la #27)', () => {
  it('«Tienda Esperanza» y «Tienda La Esperanza» son equivalentes', () => {
    expect(equivalentStoreNames('Tienda Esperanza', 'Tienda La Esperanza')).toBe(true);
  });

  it('no distingue tildes ni mayúsculas', () => {
    expect(equivalentStoreNames('MINIMERCADO DON JOSÉ', 'don jose')).toBe(true);
  });

  it('«Tienda Esperanza» y «Tienda El Sol» no lo son', () => {
    expect(equivalentStoreNames('Tienda Esperanza', 'Tienda El Sol')).toBe(false);
  });

  it('dos nombres hechos solo de palabras comunes no se consideran equivalentes', () => {
    expect(equivalentStoreNames('La Tienda', 'Supermercado')).toBe(false);
  });
});
