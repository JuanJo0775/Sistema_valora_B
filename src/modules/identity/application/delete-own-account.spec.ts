import {
  AccountGoneError,
  DeleteOwnAccount,
  InvalidConfirmationError,
  InvalidPasswordError,
  LastModeratorError,
  TooManyAttemptsError,
} from './delete-own-account';
import { FakeHasher, FakeLimiter, InMemoryDeletion } from './deletion-doubles.testing';

const now = new Date('2026-11-18T10:00:00Z');
const ana = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@correo.com',
  passwordHash: 'hash:la-clave-de-ana',
  role: 'reportante' as const,
  deletionScheduledFor: null,
};
const mod = (id: string) => ({
  id,
  passwordHash: 'hash:la-clave-de-ana',
  role: 'moderador' as const,
  deletionScheduledFor: null,
});

function setup(blocked: Record<string, number> = {}, clock = { now: () => now }) {
  const deletion = new InMemoryDeletion();
  const hasher = new FakeHasher();
  const limiter = new FakeLimiter(blocked);
  const useCase = new DeleteOwnAccount({ deletion, hasher, limiter, clock });
  return { deletion, hasher, limiter, useCase };
}

const input = (accountId = ana.id, password = 'la-clave-de-ana') => ({
  accountId,
  password,
  ip: '203.0.113.7',
});

describe('eliminar la propia cuenta (ADR-032)', () => {
  it('con la contraseña correcta marca la cuenta para dentro de 10 días y revoca sus sesiones', async () => {
    const { deletion, limiter, useCase } = setup();
    deletion.add({ ...ana });

    const result = await useCase.execute(input());

    expect(result.scheduledFor).toEqual(new Date('2026-11-28T10:00:00Z'));
    expect(deletion.accounts.get(ana.id)?.deletionScheduledFor).toEqual(result.scheduledFor);
    expect(deletion.revoked).toEqual([ana.id]);
    expect(limiter.resets).toEqual([`eliminar-cuenta:${ana.id}`]);
  });

  it('pedirlo otra vez no mueve la fecha', async () => {
    let current = now;
    const { deletion, useCase } = setup({}, { now: () => current });
    deletion.add({ ...ana });
    const first = await useCase.execute(input());

    current = new Date('2026-11-20T10:00:00Z');
    const second = await useCase.execute(input());

    expect(second.scheduledFor).toEqual(first.scheduledFor);
  });

  it('con una contraseña mala responde InvalidPasswordError, cuenta el fallo y no marca nada', async () => {
    const { deletion, hasher, limiter, useCase } = setup();
    deletion.add({ ...ana });

    await expect(useCase.execute(input(ana.id, 'otra-clave'))).rejects.toThrow(
      InvalidPasswordError,
    );

    expect(hasher.verified).toEqual([ana.passwordHash]);
    expect(deletion.accounts.get(ana.id)?.deletionScheduledFor).toBeNull();
    expect(limiter.recorded).toContain(`eliminar-cuenta:${ana.id}`);
  });

  it.each([
    ['por cuenta', `eliminar-cuenta:${ana.id}`, 600],
    ['por IP', 'eliminar-cuenta-ip:203.0.113.7', 120],
  ])('al pasar el límite %s responde 429 sin verificar la contraseña', async (_case, key, secs) => {
    const { deletion, hasher, useCase } = setup({ [key]: secs });
    deletion.add({ ...ana });

    const attempt = useCase.execute(input());

    await expect(attempt).rejects.toThrow(TooManyAttemptsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: secs });
    expect(hasher.verified).toHaveLength(0);
  });

  it('el único moderador no puede eliminarse; con otro moderador sí', async () => {
    const { deletion, useCase } = setup();
    const only = deletion.add(mod('22222222-2222-4222-8222-222222222222'));

    await expect(useCase.execute(input(only.id))).rejects.toThrow(LastModeratorError);
    expect(only.deletionScheduledFor).toBeNull();

    deletion.add(mod('33333333-3333-4333-8333-333333333333'));
    await expect(useCase.execute(input(only.id))).resolves.toBeDefined();
  });

  it('dos moderadores no pueden eliminarse los dos: el segundo es el último', async () => {
    const { deletion, useCase } = setup();
    const first = deletion.add(mod('22222222-2222-4222-8222-222222222222'));
    const second = deletion.add(mod('33333333-3333-4333-8333-333333333333'));

    await useCase.execute(input(first.id));

    await expect(useCase.execute(input(second.id))).rejects.toThrow(LastModeratorError);
  });

  // ADR-029, fase 2 (#179) y grill de la #178, pregunta 3: una cuenta creada con Google no tiene
  // contraseña; confirma escribiendo su correo (sin importar espacios ni mayúsculas).
  it('una cuenta sin contraseña confirma escribiendo su correo y queda pendiente 10 días, sin sesiones', async () => {
    const { deletion, hasher, limiter, useCase } = setup();
    deletion.add({ ...ana, passwordHash: null });

    const result = await useCase.execute({
      accountId: ana.id,
      confirmEmail: '  Ana@Correo.com ',
      ip: '203.0.113.7',
    });

    expect(result.scheduledFor).toEqual(new Date('2026-11-28T10:00:00Z'));
    expect(deletion.accounts.get(ana.id)?.deletionScheduledFor).toEqual(result.scheduledFor);
    expect(deletion.revoked).toEqual([ana.id]);
    expect(hasher.verified).toHaveLength(0);
    expect(limiter.resets).toEqual([`eliminar-cuenta:${ana.id}`]);
  });

  it('con un correo que no es el de la cuenta responde InvalidConfirmationError, cuenta el fallo y no marca nada', async () => {
    const { deletion, limiter, useCase } = setup();
    deletion.add({ ...ana, passwordHash: null });

    const attempt = useCase.execute({
      accountId: ana.id,
      confirmEmail: 'otra@correo.com',
      ip: '203.0.113.7',
    });

    await expect(attempt).rejects.toThrow(InvalidConfirmationError);
    expect(deletion.accounts.get(ana.id)?.deletionScheduledFor).toBeNull();
    expect(deletion.revoked).toHaveLength(0);
    expect(limiter.recorded).toContain(`eliminar-cuenta:${ana.id}`);
  });

  it('una cuenta con contraseña no puede confirmar con el correo: responde InvalidPasswordError y no marca nada', async () => {
    const { deletion, limiter, useCase } = setup();
    deletion.add({ ...ana });

    const attempt = useCase.execute({
      accountId: ana.id,
      confirmEmail: 'ana@correo.com',
      ip: '203.0.113.7',
    });

    await expect(attempt).rejects.toThrow(InvalidPasswordError);
    expect(deletion.accounts.get(ana.id)?.deletionScheduledFor).toBeNull();
    expect(limiter.recorded).toContain(`eliminar-cuenta:${ana.id}`);
  });

  it('una cuenta sin contraseña que envía una contraseña responde InvalidPasswordError sin verificar ningún hash', async () => {
    const { deletion, hasher, limiter, useCase } = setup();
    deletion.add({ ...ana, passwordHash: null });

    await expect(useCase.execute(input())).rejects.toThrow(InvalidPasswordError);

    // Verificar contra un hash vacío hace fallar a argon2 (sería un 500): no se llega a verificar.
    expect(hasher.verified).toHaveLength(0);
    expect(deletion.accounts.get(ana.id)?.deletionScheduledFor).toBeNull();
    expect(limiter.recorded).toContain(`eliminar-cuenta:${ana.id}`);
  });

  it('una cuenta que ya no existe responde AccountGoneError', async () => {
    const { useCase } = setup();

    await expect(useCase.execute(input())).rejects.toThrow(AccountGoneError);
  });
});
