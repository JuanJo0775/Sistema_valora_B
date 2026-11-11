import { DomainError } from './domain-error';

export type Freshness = 'vigente' | 'por_confirmar' | 'desactualizado';

export class InvalidObservationDateError extends DomainError {}

export interface FreshnessInput {
  observedAt: Date;
  now: Date;
  ttlDays: number;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function freshnessOf({ observedAt, now, ttlDays }: FreshnessInput): Freshness {
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
