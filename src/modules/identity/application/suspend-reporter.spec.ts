import { SuspendReporter } from './suspend-reporter';

const now = new Date('2026-11-14T14:00:00Z');
const anaId = '11111111-1111-4111-8111-111111111111';
const anaKey = 'a'.repeat(64);

interface StoredAccount {
  reporterKey: string;
  suspendedUntil: Date | null;
}

function setup(suspendedUntil: Date | null = null) {
  const accounts = new Map<string, StoredAccount>([
    [anaId, { reporterKey: anaKey, suspendedUntil }],
  ]);
  const revoked: { accountId: string; at: Date }[] = [];
  const suspend = new SuspendReporter({
    accounts: {
      byReporterKey: (reporterKey) => {
        const found = [...accounts].find(([, account]) => account.reporterKey === reporterKey);
        return Promise.resolve(
          found ? { id: found[0], suspendedUntil: found[1].suspendedUntil } : null,
        );
      },
      suspend: (accountId, until) => {
        const account = accounts.get(accountId);
        if (account) account.suspendedUntil = until;
        return Promise.resolve();
      },
    },
    sessions: {
      revokeAllOf: (accountId, at) => {
        revoked.push({ accountId, at });
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { accounts, revoked, suspend };
}

describe('suspender a un reportante por su clave seudónima (grill de la #33)', () => {
  it('suspende la cuenta hasta la fecha pedida y revoca todas sus sesiones', async () => {
    const { accounts, revoked, suspend } = setup();
    const until = new Date('2026-11-21T14:00:00Z');

    await suspend.execute({ reporterKey: anaKey, suspendedUntil: until });

    expect(accounts.get(anaId)?.suspendedUntil).toEqual(until);
    expect(revoked).toEqual([{ accountId: anaId, at: now }]);
  });

  it('una suspensión nueva extiende la fecha, pero nunca la acorta', async () => {
    const longer = new Date('2026-11-25T14:00:00Z');
    const { accounts, suspend } = setup(longer);

    await suspend.execute({
      reporterKey: anaKey,
      suspendedUntil: new Date('2026-11-21T14:00:00Z'),
    });
    expect(accounts.get(anaId)?.suspendedUntil).toEqual(longer);

    const later = new Date('2026-11-30T14:00:00Z');
    await suspend.execute({ reporterKey: anaKey, suspendedUntil: later });
    expect(accounts.get(anaId)?.suspendedUntil).toEqual(later);
  });

  it('una clave que ninguna cuenta tiene no hace nada', async () => {
    const { accounts, revoked, suspend } = setup();

    await suspend.execute({ reporterKey: 'b'.repeat(64), suspendedUntil: now });

    expect(accounts.get(anaId)?.suspendedUntil).toBeNull();
    expect(revoked).toEqual([]);
  });
});
