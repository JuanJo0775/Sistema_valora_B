import { InMemoryAttemptLimiter } from './in-memory-attempt-limiter';

const start = new Date('2026-11-12T14:00:00Z');
const rule = { limit: 3, windowMinutes: 15 };

// Reloj falso que la prueba mueve a mano.
function setup() {
  let now = start;
  const limiter = new InMemoryAttemptLimiter({ now: () => now });
  const advanceMinutes = (minutes: number) => {
    now = new Date(now.getTime() + minutes * 60 * 1000);
  };
  return { limiter, advanceMinutes };
}

describe('límite de intentos en una ventana fija', () => {
  it('permite hasta el límite y después bloquea, diciendo cuántos segundos faltan', () => {
    const { limiter, advanceMinutes } = setup();

    limiter.record('correo:ana@correo.com', rule);
    limiter.record('correo:ana@correo.com', rule);
    expect(limiter.retryAfterSeconds('correo:ana@correo.com', rule)).toBeNull();

    limiter.record('correo:ana@correo.com', rule);
    advanceMinutes(5);

    expect(limiter.retryAfterSeconds('correo:ana@correo.com', rule)).toBe(10 * 60);
    expect(limiter.retryAfterSeconds('correo:otro@correo.com', rule)).toBeNull();
  });
});
