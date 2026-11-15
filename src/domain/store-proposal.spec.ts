import { equivalentStoreNames, isInServiceArea } from './store-proposal';

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

describe('zona de servicio (RF-005 RN1, grill de la #27)', () => {
  it('Armenia, Calarcá y Filandia están dentro', () => {
    expect(isInServiceArea({ lat: 4.5339, lng: -75.6811 })).toBe(true);
    expect(isInServiceArea({ lat: 4.5193, lng: -75.6431 })).toBe(true);
    expect(isInServiceArea({ lat: 4.6747, lng: -75.6583 })).toBe(true);
  });

  it('Bogotá y Pereira están fuera', () => {
    expect(isInServiceArea({ lat: 4.711, lng: -74.0721 })).toBe(false);
    expect(isInServiceArea({ lat: 4.8133, lng: -75.6961 })).toBe(false);
  });
});
