import { queueOf } from './moderation-notice-rules';

const event = (type: string, payload: Record<string, unknown> = {}) => ({ type, payload });

// #260: qué hechos del outbox dejan un caso pendiente para el moderador, y en cuál pestaña.
describe('qué hechos avisan a moderación (ADR-044)', () => {
  it('un reporte marcado por alguien entra a la cola de precios', () => {
    expect(queueOf(event('PriceFlagged', { reportId: 'r1' }))).toBe('precios');
  });

  it('un precio que la detección marcó como sospechoso entra a la cola de precios', () => {
    expect(queueOf(event('PriceAssessed', { verdict: 'sospechoso' }))).toBe('precios');
  });

  // PriceAssessed también se publica para un precio normal y cuando moderación aprueba: ahí no hay
  // nada pendiente que avisar.
  it.each(['normal', 'sin_datos'])('un precio %s no avisa a nadie', (verdict) => {
    expect(queueOf(event('PriceAssessed', { verdict }))).toBeNull();
  });

  it.each(['ReportBurstDetected', 'OfficialPriceHeld'])(
    '%s deja un caso en la cola de precios',
    (type) => {
      expect(queueOf(event(type))).toBe('precios');
    },
  );

  it.each(['PriceReported', 'PriceWithdrawn', 'MerchantVerified', 'AccountPurged'])(
    'el hecho %s no avisa a nadie',
    (type) => {
      expect(queueOf(event(type))).toBeNull();
    },
  );
});
