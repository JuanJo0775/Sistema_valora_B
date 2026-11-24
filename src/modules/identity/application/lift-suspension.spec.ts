import { LiftSuspension } from './lift-suspension';

const anaId = '11111111-1111-4111-8111-111111111111';
const anaKey = 'a'.repeat(64);
const streakEnd = new Date('2026-11-21T14:00:00Z');

function setup(suspendedUntil: Date | null) {
  const account = {
    id: anaId,
    suspendedUntil,
    reason: suspendedUntil ? 'descartes_seguidos' : null,
  };
  const lift = new LiftSuspension({
    accounts: {
      byReporterKey: (key) => Promise.resolve(key === anaKey ? { ...account } : null),
      suspend: (_accountId, until, reason) => {
        account.suspendedUntil = until;
        account.reason = reason;
        return Promise.resolve();
      },
    },
  });
  return { account, lift };
}

describe('levantar la suspensión cuando se acepta una apelación (grill de la #71, pregunta 4)', () => {
  it('si la suspensión es la de ese descarte, se levanta', async () => {
    const { account, lift } = setup(streakEnd);

    await lift.execute({ reporterKey: anaKey, suspendedUntil: streakEnd });

    expect(account.suspendedUntil).toBeNull();
    expect(account.reason).toBeNull();
  });

  it('si la fecha es otra (otra suspensión), no se toca', async () => {
    const later = new Date('2026-11-25T14:00:00Z');
    const { account, lift } = setup(later);

    await lift.execute({ reporterKey: anaKey, suspendedUntil: streakEnd });

    expect(account.suspendedUntil).toEqual(later);
  });

  it('una cuenta sin suspensión o una clave desconocida no cambian nada', async () => {
    const { account, lift } = setup(null);

    await lift.execute({ reporterKey: anaKey, suspendedUntil: streakEnd });
    await lift.execute({ reporterKey: 'b'.repeat(64), suspendedUntil: streakEnd });

    expect(account.suspendedUntil).toBeNull();
  });
});
