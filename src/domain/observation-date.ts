import { InvalidObservationDateError } from './freshness';

export interface ObservationTimes {
  observedAt: Date;
  receivedAt: Date;
}

// Grill de la #14, pregunta 4: un precio no puede verse en el futuro; si se aceptara, sería
// «el más reciente» para siempre y ningún reporte real lo reemplazaría en price_current.
export function assertObservedAtAccepted({ observedAt, receivedAt }: ObservationTimes): void {
  if (observedAt.getTime() > receivedAt.getTime()) {
    throw new InvalidObservationDateError(
      'La fecha de observación no puede ser posterior al momento del reporte.',
    );
  }
}
