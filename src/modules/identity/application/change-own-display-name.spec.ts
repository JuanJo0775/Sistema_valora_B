import { InMemoryAttemptLimiter } from '../infrastructure/in-memory-attempt-limiter';
import { TooManyAttemptsError } from './attempt-limiter';
import {
  ChangeOwnDisplayName,
  DISPLAY_NAME_CHANGES_PER_ACCOUNT,
  type DisplayNameWriter,
} from './change-own-display-name';
import { AccountGoneError } from './delete-own-account';

let now = new Date('2026-11-23T10:00:00Z');
const clock = { now: () => now };

class InMemoryNames implements DisplayNameWriter {
  readonly names = new Map<string, string | null>([
    ['cuenta-1', 'Ana María'],
    ['cuenta-vieja', null],
  ]);

  changeDisplayName(accountId: string, displayName: string): Promise<boolean> {
    if (!this.names.has(accountId)) return Promise.resolve(false);
    this.names.set(accountId, displayName);
    return Promise.resolve(true);
  }
}

function setup() {
  const names = new InMemoryNames();
  const limiter = new InMemoryAttemptLimiter(clock);
  return { names, useCase: new ChangeOwnDisplayName({ names, limiter }) };
}

describe('cambiar el propio nombre visible', () => {
  beforeEach(() => {
    now = new Date('2026-11-23T10:00:00Z');
  });

  it('guarda el nombre sin espacios sobrantes y lo devuelve', async () => {
    const { names, useCase } = setup();

    await expect(
      useCase.execute({ accountId: 'cuenta-1', displayName: '  Sara   Luz ' }),
    ).resolves.toBe('Sara Luz');

    expect(names.names.get('cuenta-1')).toBe('Sara Luz');
  });

  it('una cuenta anterior al nombre (sin nombre) puede ponerse uno por primera vez', async () => {
    const { names, useCase } = setup();

    await useCase.execute({ accountId: 'cuenta-vieja', displayName: 'Luis' });

    expect(names.names.get('cuenta-vieja')).toBe('Luis');
  });

  it('un nombre igual al actual es idempotente', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute({ accountId: 'cuenta-1', displayName: 'Ana María' }),
    ).resolves.toBe('Ana María');
  });

  it('una cuenta que ya no existe responde AccountGoneError', async () => {
    const { useCase } = setup();

    await expect(useCase.execute({ accountId: 'nadie', displayName: 'Sara' })).rejects.toThrow(
      AccountGoneError,
    );
  });

  it('pasado el tope por cuenta responde TooManyAttemptsError sin cambiar el nombre', async () => {
    const { names, useCase } = setup();
    for (let i = 0; i < DISPLAY_NAME_CHANGES_PER_ACCOUNT.limit; i += 1) {
      await useCase.execute({ accountId: 'cuenta-1', displayName: 'Sara' });
    }

    const rejected = useCase.execute({ accountId: 'cuenta-1', displayName: 'Otra' });

    await expect(rejected).rejects.toThrow(TooManyAttemptsError);
    await expect(rejected).rejects.toMatchObject({ retryAfterSeconds: 3600 });
    expect(names.names.get('cuenta-1')).toBe('Sara');
  });

  it('el tope es por cuenta y se libera al pasar la ventana', async () => {
    const { useCase } = setup();
    for (let i = 0; i < DISPLAY_NAME_CHANGES_PER_ACCOUNT.limit; i += 1) {
      await useCase.execute({ accountId: 'cuenta-1', displayName: 'Sara' });
    }

    await expect(useCase.execute({ accountId: 'cuenta-vieja', displayName: 'Luis' })).resolves.toBe(
      'Luis',
    );
    now = new Date(now.getTime() + DISPLAY_NAME_CHANGES_PER_ACCOUNT.windowMinutes * 60_000 + 1000);
    await expect(useCase.execute({ accountId: 'cuenta-1', displayName: 'Sara' })).resolves.toBe(
      'Sara',
    );
  });
});
