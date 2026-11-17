// De dónde viene el precio vigente de una tienda: lo vio la comunidad o es un dato inicial de la
// semilla (B#135, por ejemplo el precio publicado en la página de una cadena).
export type PriceSource = 'comunidad' | 'siembra';

export type InitialPriceAction = 'insert' | 'update' | 'keep';

// B#135: un dato inicial solo llena el hueco. Nunca reemplaza lo que vio la comunidad, y volver a
// sembrar actualiza el dato inicial anterior en vez de duplicarlo.
export function initialPriceAction(
  current: { source: PriceSource } | undefined,
): InitialPriceAction {
  if (!current) return 'insert';
  return current.source === 'siembra' ? 'update' : 'keep';
}
