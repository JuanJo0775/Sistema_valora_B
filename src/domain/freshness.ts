export type Freshness = 'vigente' | 'por_confirmar';

export interface FreshnessInput {
  observedAt: Date;
  now: Date;
  ttlDays: number;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function freshnessOf({ observedAt, now, ttlDays }: FreshnessInput): Freshness {
  const age = now.getTime() - observedAt.getTime();
  const ttl = ttlDays * DAY_IN_MILLISECONDS;
  return age < ttl ? 'vigente' : 'por_confirmar';
}
