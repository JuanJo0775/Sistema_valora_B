import { isAtEstablishment } from './merchant-claim';

// Un grado de latitud mide unos 111.195 m: así se ubican puntos a una distancia conocida.
const METERS_PER_DEGREE = 111_195;
const store = { lat: 4.5339, lng: -75.6811 };
const north = (meters: number) => ({ lat: store.lat + meters / METERS_PER_DEGREE, lng: store.lng });

describe('presencia en la tienda al registrar un comercio (D2 del grill comercial)', () => {
  it('a 30 m de la tienda, la persona está en la tienda', () => {
    expect(isAtEstablishment(north(30), store)).toBe(true);
  });

  it('a 60 m de la tienda, la persona no está en la tienda', () => {
    expect(isAtEstablishment(north(60), store)).toBe(false);
  });
});
