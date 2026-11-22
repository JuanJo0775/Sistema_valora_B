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
) {
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
        return Promise.resolve(true);
      },
    },
    clock: { now: () => now },
  });
  return { digests, sent, recorded };
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
});
