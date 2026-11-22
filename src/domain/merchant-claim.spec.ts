import { isAtEstablishment, isValidNit } from './merchant-claim';

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

// El dígito de verificación solo detecta errores al escribir: no dice si el NIT existe ni de quién es.
describe('NIT del comercio con su dígito de verificación (D2 del grill comercial)', () => {
  it('el NIT de la DIAN, 800.197.268-4, tiene el dígito correcto', () => {
    expect(isValidNit('800.197.268-4')).toBe(true);
  });

  it('890903938-8 y 890900608-9 se aceptan también sin puntos', () => {
    expect(isValidNit('890903938-8')).toBe(true);
    expect(isValidNit('890900608-9')).toBe(true);
  });

  it('800.197.268-5 se rechaza: el dígito no corresponde', () => {
    expect(isValidNit('800.197.268-5')).toBe(false);
  });

  it('dos dígitos invertidos, 801.097.268-4, se rechazan', () => {
    expect(isValidNit('801.097.268-4')).toBe(false);
  });

  it('un texto sin guion ni dígito de verificación se rechaza', () => {
    expect(isValidNit('800197268')).toBe(false);
    expect(isValidNit('abc-4')).toBe(false);
  });
});
