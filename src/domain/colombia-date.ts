// Colombia está en UTC-5 todo el año (no cambia de hora).
export const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;

// La fecha (AAAA-MM-DD) de ese instante en Colombia.
export const colombiaDate = (instant: Date): string =>
  new Date(instant.getTime() + COLOMBIA_OFFSET_MS).toISOString().slice(0, 10);
