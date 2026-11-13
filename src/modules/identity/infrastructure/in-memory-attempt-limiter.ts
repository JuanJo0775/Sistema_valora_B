import type { AttemptLimiter, AttemptRule, Clock } from '../application/attempt-limiter';

interface Window {
  startedAt: number;
  count: number;
}

// Contadores en memoria: al reiniciar el servidor vuelven a cero (riesgo aceptado en la pregunta 10).
export class InMemoryAttemptLimiter implements AttemptLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly clock: Clock) {}

  retryAfterSeconds(key: string, rule: AttemptRule): number | null {
    const window = this.windows.get(key);
    if (!window || window.count < rule.limit) return null;
    const endsAt = window.startedAt + rule.windowMinutes * 60 * 1000;
    return Math.ceil((endsAt - this.clock.now().getTime()) / 1000);
  }

  record(key: string, rule: AttemptRule): void {
    const now = this.clock.now().getTime();
    const window = this.windows.get(key);
    if (window && now < window.startedAt + rule.windowMinutes * 60 * 1000) window.count += 1;
    else this.windows.set(key, { startedAt: now, count: 1 });
  }

  reset(key: string): void {
    this.windows.delete(key);
  }
}
