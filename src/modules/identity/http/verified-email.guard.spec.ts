import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.validation';
import { VerifiedEmailGuard } from './verified-email.guard';

const contextWith = (session: { emailVerified: boolean } | undefined): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ session }) }) }) as unknown as ExecutionContext;

const guard = (required: boolean) =>
  new VerifiedEmailGuard({ get: () => required } as unknown as ConfigService<Env, true>);

describe('exigir el correo verificado (ADR-029)', () => {
  it('con la verificación exigida, una cuenta sin verificar recibe 403 EMAIL_NOT_VERIFIED', () => {
    expect(() => guard(true).canActivate(contextWith({ emailVerified: false }))).toThrow(
      ForbiddenException,
    );
  });

  it('con la verificación exigida, una cuenta verificada pasa', () => {
    expect(guard(true).canActivate(contextWith({ emailVerified: true }))).toBe(true);
  });

  it('con REQUIRE_VERIFIED_EMAIL en false no exige nada', () => {
    expect(guard(false).canActivate(contextWith({ emailVerified: false }))).toBe(true);
  });
});
