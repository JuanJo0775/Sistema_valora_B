import type { Observation } from './stores';

// Grill de la #32, pregunta 4: lo que decide el moderador manda sobre el veredicto automático.
// Un descartado deja de contar; un sospechoso aprobado cuenta como cualquier precio normal.
export const isDiscarded = (seen: Observation): boolean => seen.moderation === 'descartado';

export const isUnderReview = (seen: Observation): boolean =>
  seen.moderation === undefined && seen.verdict.status === 'sospechoso';

export const isReliable = (seen: Observation): boolean =>
  !isDiscarded(seen) && !isUnderReview(seen);
