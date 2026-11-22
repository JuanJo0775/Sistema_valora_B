import { assertValidOpeningHours, InvalidOpeningHoursError, type OpeningHours } from './opening-hours';

const day = { opens: '07:00', closes: '20:00' };
// Lunes a sábado de 7:00 a 20:00 y el domingo cerrado.
const week: OpeningHours = {
  lunes: day,
  martes: day,
  miercoles: day,
  jueves: day,
  viernes: day,
  sabado: day,
  domingo: null,
};

describe('horario de una tienda (D5 del grill comercial, precisiones del 22-nov)', () => {
  it('cada día cerrado o con su hora de apertura y de cierre es válido', () => {
    expect(() => {
      assertValidOpeningHours(week);
    }).not.toThrow();
  });

  it('abierta todo el día se escribe de 00:00 a 23:59', () => {
    expect(() => {
      assertValidOpeningHours({ ...week, domingo: { opens: '00:00', closes: '23:59' } });
    }).not.toThrow();
  });

  it.each<[string, unknown]>([
    ['una hora que cierra antes de abrir', { ...week, lunes: { opens: '20:00', closes: '07:00' } }],
    ['una hora sin el formato HH:MM', { ...week, martes: { opens: '7am', closes: '20:00' } }],
    ['una hora que no existe', { ...week, jueves: { opens: '07:00', closes: '24:30' } }],
    ['un día que falta', { ...week, domingo: undefined }],
  ])('se rechaza %s', (_case, hours) => {
    expect(() => {
      assertValidOpeningHours(hours as OpeningHours);
    }).toThrow(InvalidOpeningHoursError);
  });
});
