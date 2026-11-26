// Las pestañas del panel de moderación que pueden avisar (ADR-043). Hoy solo precios; tiendas,
// productos y comercios llegan con sus eventos.
export type ModerationQueue = 'precios';

const QUEUES_OF_PRICES = new Set(['PriceFlagged', 'ReportBurstDetected', 'OfficialPriceHeld']);

export interface OutboxFact {
  type: string;
  payload: Record<string, unknown>;
}

// Solo se mira el tipo y, en un caso, el veredicto: del payload nunca se lee ni se copia nada que
// identifique a alguien (EC-08).
export function queueOf(fact: OutboxFact): ModerationQueue | null {
  // Una marca, una ráfaga de reportes y un precio oficial sin referencia dejan un caso en la cola de precios.
  if (QUEUES_OF_PRICES.has(fact.type)) return 'precios';
  // PriceAssessed también se publica con un precio normal o aprobado por moderación: no hay nada pendiente.
  if (fact.type === 'PriceAssessed')
    return fact.payload['verdict'] === 'sospechoso' ? 'precios' : null;
  return null;
}
