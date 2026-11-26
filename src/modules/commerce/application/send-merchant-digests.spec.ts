import type { MerchantAlert } from './merchant-alerts';
import { SendMerchantDigests } from './send-merchant-digests';

// 22 de noviembre de 2026: 8:00 a. m. y 6:00 a. m. en Colombia (UTC-5).
const morning = new Date('2026-11-22T13:00:00Z');
const dawn = new Date('2026-11-22T11:00:00Z');

const expiring: MerchantAlert = {
  kind: 'vence_pronto',
  presentationId: 'arroz',
  productName: 'Arroz Diana · 500 g',
  confirmedAt: new Date('2026-11-09T15:00:00Z'),
  message: 'Tu precio oficial de Arroz Diana · 500 g vence mañana: reconfírmalo.',
};

function setup(
  alertsOf: Record<string, MerchantAlert[]>,
  now: Date,
  known: Record<string, string[]> = {},
  emailDelivered = true,
) {
  const raised: string[] = [];
  const sent: { accountId: string; subject: string; text: string }[] = [];
  const recorded: { accountId: string; keys: string[] }[] = [];
  const digests = new SendMerchantDigests({
    merchants: { verifiedAccounts: () => Promise.resolve(Object.keys(alertsOf)) },
    alerts: { execute: (accountId) => Promise.resolve(alertsOf[accountId] ?? []) },
    notices: {
      knownKeys: (accountId) => Promise.resolve(new Set(known[accountId] ?? [])),
      sentOn: () => Promise.resolve(false),
      record: (accountId, _day, keys) => {
        recorded.push({ accountId, keys });
        return Promise.resolve();
      },
    },
    notify: {
      send: (accountId, notice) => {
        sent.push({ accountId, ...notice });
        return Promise.resolve(emailDelivered);
      },
    },
    // #260: moderación de los avisos push; commerce solo publica un evento con el id de la cuenta.
    raised: {
      raise: (accountId) => {
        raised.push(accountId);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { digests, sent, recorded, raised };
}

// Precisiones de D4 (22-nov): máximo un correo al día, desde las 7:00 a. m., solo si hay algo nuevo.
describe('resumen diario de avisos por correo (B9, #209)', () => {
  it('al comercio con un aviso nuevo le llega un correo con todos sus avisos, y queda anotado', async () => {
    const { digests, sent, recorded } = setup({ 'cuenta-de-dona-rosa': [expiring] }, morning);

    await expect(digests.execute()).resolves.toEqual({ sent: 1 });

    expect(sent).toEqual([
      {
        accountId: 'cuenta-de-dona-rosa',
        subject: 'Tienes 1 aviso nuevo en Valora',
        text: expect.stringContaining(expiring.message) as unknown,
      },
    ]);
    expect(recorded).toEqual([
      {
        accountId: 'cuenta-de-dona-rosa',
        keys: ['vence_pronto:arroz:2026-11-09T15:00:00.000Z'],
      },
    ]);
  });

  it('sin nada nuevo, o antes de las 7:00 a. m., no envía nada', async () => {
    const known = { 'cuenta-de-dona-rosa': ['vence_pronto:arroz:2026-11-09T15:00:00.000Z'] };

    const repeated = setup({ 'cuenta-de-dona-rosa': [expiring] }, morning, known);
    const early = setup({ 'cuenta-de-dona-rosa': [expiring] }, dawn);

    await expect(repeated.digests.execute()).resolves.toEqual({ sent: 0 });
    await expect(early.digests.execute()).resolves.toEqual({ sent: 0 });
    expect([...repeated.sent, ...early.sent]).toEqual([]);
  });

  // #260: el aviso push no depende del correo; commerce solo publica MerchantAlertsRaised, con el id
  // de la cuenta, y notifications decide cómo avisar (ADR-044).
  it('publica MerchantAlertsRaised cuando hay avisos nuevos, aunque el correo no se pueda enviar', async () => {
    const { digests, raised, recorded } = setup(
      { 'cuenta-de-dona-rosa': [expiring] },
      morning,
      {},
      false,
    );

    await digests.execute();

    expect(raised).toEqual(['cuenta-de-dona-rosa']);
    // Sin correo entregado no se anota: se reintenta en la siguiente pasada, como siempre.
    expect(recorded).toEqual([]);
  });

  // Prueba de resguardo: ya pasa con la regla hecha.
  it('sin avisos nuevos, o antes de las 7:00 a. m., no publica el evento', async () => {
    const known = { 'cuenta-de-dona-rosa': ['vence_pronto:arroz:2026-11-09T15:00:00.000Z'] };
    const repeated = setup({ 'cuenta-de-dona-rosa': [expiring] }, morning, known);
    const early = setup({ 'cuenta-de-dona-rosa': [expiring] }, dawn);

    await repeated.digests.execute();
    await early.digests.execute();

    expect([...repeated.raised, ...early.raised]).toEqual([]);
  });
});
