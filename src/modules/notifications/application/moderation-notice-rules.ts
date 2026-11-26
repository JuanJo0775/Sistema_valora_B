// Las pestañas del panel de moderación que avisan (ADR-043). Coinciden con el valor de
// `?vista=` del panel.
export type ModerationQueue = 'precios' | 'tiendas' | 'productos' | 'comercios';

// Qué hecho del outbox deja un caso en qué cola. Una marca, una ráfaga y un precio oficial sin
// referencia llegan a precios; una propuesta o una corrección de tienda, a tiendas.
const QUEUE_OF_FACT: Record<string, ModerationQueue> = {
  PriceFlagged: 'precios',
  ReportBurstDetected: 'precios',
  OfficialPriceHeld: 'precios',
  // PriceAssessed también se publica con un precio normal o aprobado por moderación: se resuelve
  // por el veredicto, en queueOf.
  PriceAssessed: 'precios',
  StoreProposed: 'tiendas',
  StoreCorrectionRequested: 'tiendas',
  ProductRequested: 'productos',
};

// Los hechos del outbox a los que se suscribe notifications para avisar a moderación.
export const MODERATION_FACT_TYPES = Object.keys(QUEUE_OF_FACT);

export interface OutboxFact {
  type: string;
  payload: Record<string, unknown>;
}

// Solo se mira el tipo y, en un caso, el veredicto: del payload nunca se lee ni se copia nada que
// identifique a alguien (EC-08).
export function queueOf(fact: OutboxFact): ModerationQueue | null {
  const queue = QUEUE_OF_FACT[fact.type];
  if (queue === undefined) return null;
  // No hay nada pendiente si el precio es normal o lo aprobó moderación.
  if (fact.type === 'PriceAssessed' && fact.payload['verdict'] !== 'sospechoso') return null;
  return queue;
}
