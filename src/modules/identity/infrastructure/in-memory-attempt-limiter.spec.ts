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

  it('al terminar la ventana, o al reiniciar la clave, se permite de nuevo', () => {
    const { limiter, advanceMinutes } = setup();
    const fill = (key: string) => {
      for (let attempt = 0; attempt < rule.limit; attempt += 1) limiter.record(key, rule);
    };

    fill('ip:203.0.113.7');
    advanceMinutes(15);
    expect(limiter.retryAfterSeconds('ip:203.0.113.7', rule)).toBeNull();

    fill('correo:ana@correo.com');
    limiter.reset('correo:ana@correo.com');
    expect(limiter.retryAfterSeconds('correo:ana@correo.com', rule)).toBeNull();
  });
});
