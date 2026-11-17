import { InvalidObservationDateError } from './freshness';

export interface ObservationTimes {
  observedAt: Date;
  receivedAt: Date;
}

// Margen por la diferencia entre el reloj del celular y el del servidor.
const CLOCK_SKEW_MS = 5 * 60 * 1000;
// Grill de la #29, pregunta 1: valor PROVISIONAL (ADR-005).
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Grill de la #14, pregunta 4: un precio no puede verse en el futuro; si se aceptara, sería
// «el más reciente» para siempre y ningún reporte real lo reemplazaría en price_current.
export function assertObservedAtAccepted({ observedAt, receivedAt }: ObservationTimes): void {
  if (observedAt.getTime() > receivedAt.getTime() + CLOCK_SKEW_MS) {
    throw new InvalidObservationDateError(
      'La fecha de observación no puede ser posterior al momento del reporte.',
    );
  }
  if (observedAt.getTime() < receivedAt.getTime() - MAX_AGE_MS) {
    throw new InvalidObservationDateError(
      'La fecha de observación no puede ser de hace más de 24 horas.',
    );
  }
}
