import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './application/account-repository';
import type { AttemptLimiter } from './application/attempt-limiter';
import type { Clock } from './application/clock';
import type { PasswordHasher } from './application/password-hasher';
import { Login } from './application/login';
import { Logout } from './application/logout';
import { RegisterAccount } from './application/register-account';
import { ResolveSession } from './application/resolve-session';
import { SESSION_REPOSITORY, type SessionRepository } from './application/session-repository';
import { AuthController } from './http/auth.controller';
import { SessionGuard } from './http/session.guard';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { DrizzleAccountRepository } from './infrastructure/drizzle-account-repository';
import { DrizzleSessionRepository } from './infrastructure/drizzle-session-repository';
import { InMemoryAttemptLimiter } from './infrastructure/in-memory-attempt-limiter';

const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
const ATTEMPT_LIMITER = Symbol('ATTEMPT_LIMITER');
const CLOCK = Symbol('CLOCK');

@Module({
  controllers: [AuthController],
  providers: [
    { provide: CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: ATTEMPT_LIMITER,
      inject: [CLOCK],
      useFactory: (clock: Clock): AttemptLimiter => new InMemoryAttemptLimiter(clock),
    },
    {
      provide: ACCOUNT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): AccountRepository => new DrizzleAccountRepository(db),
    },
    {
      provide: RegisterAccount,
      inject: [ACCOUNT_REPOSITORY, PASSWORD_HASHER, ATTEMPT_LIMITER, CLOCK],
      useFactory: (
        accounts: AccountRepository,
        hasher: PasswordHasher,
        limiter: AttemptLimiter,
        clock: Clock,
      ): RegisterAccount => new RegisterAccount({ accounts, hasher, limiter, clock }),
    },
    {
      provide: SESSION_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): SessionRepository => new DrizzleSessionRepository(db),
    },
    {
      provide: Login,
      inject: [ACCOUNT_REPOSITORY, PASSWORD_HASHER, SESSION_REPOSITORY, ATTEMPT_LIMITER, CLOCK],
      useFactory: (
        accounts: AccountRepository,
        hasher: PasswordHasher,
        sessions: SessionRepository,
        limiter: AttemptLimiter,
        clock: Clock,
      ): Login => new Login({ accounts, hasher, sessions, limiter, clock }),
    },
    {
      provide: ResolveSession,
      inject: [SESSION_REPOSITORY, CLOCK],
      useFactory: (sessions: SessionRepository, clock: Clock): ResolveSession =>
        new ResolveSession({ sessions, clock }),
    },
    {
      provide: Logout,
      inject: [SESSION_REPOSITORY, CLOCK],
      useFactory: (sessions: SessionRepository, clock: Clock): Logout =>
        new Logout({ sessions, clock }),
    },
    SessionGuard,
  ],
  // Otros módulos protegen sus rutas con el guard (en la #16, POST /reports de pricing).
  exports: [ResolveSession, SessionGuard],
})
export class IdentityModule {}
