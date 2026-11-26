import { queueOf } from './moderation-notice-rules';

const event = (type: string, payload: Record<string, unknown> = {}) => ({ type, payload });

// #260: qué hechos del outbox dejan un caso pendiente para el moderador, y en cuál pestaña.
describe('qué hechos avisan a moderación (ADR-044)', () => {
  it('un reporte marcado por alguien entra a la cola de precios', () => {
    expect(queueOf(event('PriceFlagged', { reportId: 'r1' }))).toBe('precios');
  });
});
