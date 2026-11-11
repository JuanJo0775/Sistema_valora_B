export type Freshness = 'vigente' | 'por_confirmar' | 'desactualizado';

export interface FreshnessInput {
  observedAt: Date;
  now: Date;
  ttlDays: number;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function freshnessOf({ observedAt, now, ttlDays }: FreshnessInput): Freshness {
  const age = now.getTime() - observedAt.getTime();
  const ttl = ttlDays * DAY_IN_MILLISECONDS;
  if (age < ttl) return 'vigente';
  if (age < 2 * ttl) return 'por_confirmar';
  return 'desactualizado';
}
