import { InvalidObservationDateError } from './freshness';
import { assertObservedAtAccepted } from './observation-date';

const MINUTE = 60 * 1000;
const receivedAt = new Date('2026-11-12T14:00:00Z');
const minutesAfterReceipt = (minutes: number): Date =>
  new Date(receivedAt.getTime() + minutes * MINUTE);

describe('hora de observación de un reporte', () => {
  it('un precio visto 6 minutos en el futuro se rechaza', () => {
    expect(() => {
      assertObservedAtAccepted({ observedAt: minutesAfterReceipt(6), receivedAt });
    }).toThrow(InvalidObservationDateError);
  });

  it('un precio visto 3 minutos en el futuro se acepta, por la diferencia entre relojes', () => {
    expect(() => {
      assertObservedAtAccepted({ observedAt: minutesAfterReceipt(3), receivedAt });
    }).not.toThrow();
  });

  // Grill de la #29, pregunta 1: un precio de hace más de un día ya no sirve para comparar.
  it('un precio visto hace más de 24 horas se rechaza, aunque llegue de la cola sin conexión', () => {
    expect(() => {
      assertObservedAtAccepted({ observedAt: minutesAfterReceipt(-24 * 60 - 1), receivedAt });
    }).toThrow(InvalidObservationDateError);
  });

  it('un precio visto justo hace 24 horas se acepta', () => {
    expect(() => {
      assertObservedAtAccepted({ observedAt: minutesAfterReceipt(-24 * 60), receivedAt });
    }).not.toThrow();
  });
});
