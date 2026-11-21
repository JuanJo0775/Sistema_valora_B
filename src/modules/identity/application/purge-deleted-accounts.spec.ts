import { InMemoryDeletion } from './deletion-doubles.testing';
import { PurgeDeletedAccounts } from './purge-deleted-accounts';

const day = 24 * 60 * 60 * 1000;
const scheduled = new Date('2026-11-28T10:00:00Z');
const account = (id: string, deletionScheduledFor: Date | null) => ({
  id,
  passwordHash: 'hash:x',
  role: 'reportante' as const,
  deletionScheduledFor,
});

function setup(nowRef: { value: Date }) {
  const deletion = new InMemoryDeletion();
  const purge = new PurgeDeletedAccounts({ deletion, clock: { now: () => nowRef.value } });
  return { deletion, purge };
}

describe('purga de cuentas eliminadas (ADR-032)', () => {
  it('antes de los 10 días no borra nada; al cumplirse, sí', async () => {
    const clock = { value: new Date(scheduled.getTime() - 1) };
    const { deletion, purge } = setup(clock);
    deletion.add(account('a', scheduled));

    await expect(purge.execute()).resolves.toEqual({ purged: 0, failed: 0 });
    expect(deletion.accounts.has('a')).toBe(true);

    clock.value = scheduled;
    await expect(purge.execute()).resolves.toEqual({ purged: 1, failed: 0 });
    expect(deletion.accounts.has('a')).toBe(false);
  });

  it('no toca las cuentas sin eliminación pendiente ni las restauradas', async () => {
    const { deletion, purge } = setup({ value: new Date(scheduled.getTime() + 30 * day) });
    deletion.add(account('normal', null));
    deletion.add(account('restaurada', scheduled));
    await deletion.cancel('restaurada');

    await expect(purge.execute()).resolves.toEqual({ purged: 0, failed: 0 });

    expect([...deletion.accounts.keys()].sort()).toEqual(['normal', 'restaurada']);
  });

  it('es idempotente: repetirla no hace nada más', async () => {
    const { deletion, purge } = setup({ value: new Date(scheduled.getTime() + day) });
    deletion.add(account('a', scheduled));

    await purge.execute();

    await expect(purge.execute()).resolves.toEqual({ purged: 0, failed: 0 });
  });

  it('tolera fallos parciales: una cuenta que falla no impide las demás y se reintenta después', async () => {
    const { deletion, purge } = setup({ value: new Date(scheduled.getTime() + day) });
    deletion.add(account('mala', scheduled));
    deletion.add(account('buena', scheduled));
    deletion.failing.add('mala');

    await expect(purge.execute()).resolves.toEqual({ purged: 1, failed: 1 });
    expect([...deletion.accounts.keys()]).toEqual(['mala']);

    deletion.failing.clear();
    await expect(purge.execute()).resolves.toEqual({ purged: 1, failed: 0 });
    expect(deletion.accounts.size).toBe(0);
  });
});
