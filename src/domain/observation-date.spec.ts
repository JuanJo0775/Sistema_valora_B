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
});
