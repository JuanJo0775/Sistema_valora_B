export type Freshness = 'vigente';

export interface FreshnessInput {
  observedAt: Date;
  now: Date;
  ttlDays: number;
}

export function freshnessOf(_input: FreshnessInput): Freshness {
  return 'vigente';
}
