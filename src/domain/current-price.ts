export interface PriceObservation {
  observedAt: Date;
  receivedAt: Date;
}

// Grill de la #14, pregunta 7: el precio vigente es el observado más recientemente en la tienda,
// no el último que llegó al servidor.
export function replacesCurrentPrice(
  candidate: PriceObservation,
  current: PriceObservation,
): boolean {
  return candidate.observedAt.getTime() > current.observedAt.getTime();
}
