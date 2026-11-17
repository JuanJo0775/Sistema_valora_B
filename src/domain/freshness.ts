import { DomainError } from './domain-error';

export type Freshness = 'vigente' | 'por_confirmar' | 'desactualizado';

export class InvalidObservationDateError extends DomainError {
  readonly code = 'INVALID_OBSERVATION_DATE';
}

export class InvalidTtlError extends DomainError {
  readonly code = 'INVALID_TTL';
}

export interface FreshnessInput {
  observedAt: Date;
  now: Date;
  ttlDays: number;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function freshnessOf({ observedAt, now, ttlDays }: FreshnessInput): Freshness {
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    throw new InvalidTtlError('El TTL debe ser un número de días mayor que cero.');
  }
  if (Number.isNaN(observedAt.getTime())) {
    throw new InvalidObservationDateError('La fecha de observación no es una fecha válida.');
  }
  const age = now.getTime() - observedAt.getTime();
  if (age < 0) {
    throw new InvalidObservationDateError(
      'La fecha de observación no puede ser posterior al momento actual.',
    );
  }
  const ttl = ttlDays * DAY_IN_MILLISECONDS;
  // RN1: vigente «durante un TTL»; RN2: desactualizado solo «después de 2 veces el TTL»
  if (age <= ttl) return 'vigente';
  if (age <= 2 * ttl) return 'por_confirmar';
  return 'desactualizado';
}

// ADR-005: TTL de 7 días para categorías frescas y 14 para el resto. Valores PROVISIONALES, en un
// solo lugar porque los usan la comparación (#15) y la confiabilidad (#31).
export const TTL_DAYS = { fresh: 7, other: 14 } as const;

export function ttlDaysFor(isFreshCategory: boolean): number {
  return isFreshCategory ? TTL_DAYS.fresh : TTL_DAYS.other;
}
