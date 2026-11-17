export interface PriceObservation {
  observedAt: Date;
  receivedAt: Date;
}

// Grill de la #14, pregunta 7: el precio vigente es el observado más recientemente en la tienda,
// no el último que llegó al servidor. En un empate gana el que llegó después, para que el
// resultado no dependa del orden en que el outbox entrega los eventos.
export function replacesCurrentPrice(
  candidate: PriceObservation,
  current: PriceObservation,
): boolean {
  const observedDifference = candidate.observedAt.getTime() - current.observedAt.getTime();
  if (observedDifference !== 0) return observedDifference > 0;
  return candidate.receivedAt.getTime() > current.receivedAt.getTime();
}
