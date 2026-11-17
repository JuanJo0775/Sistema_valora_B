import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.validation';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus } from '../../shared/events';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './application/account-repository';
import type { AttemptLimiter } from './application/attempt-limiter';
import { ChangeRole } from './application/change-role';
import type { Clock } from './application/clock';
import type { PasswordHasher } from './application/password-hasher';
import { LiftSuspension } from './application/lift-suspension';
import { Login } from './application/login';
import { Logout } from './application/logout';
import { RegisterAccount } from './application/register-account';
import { ReporterIdentity } from './application/reporter-identity';
import { ResolveSession } from './application/resolve-session';
import { SESSION_REPOSITORY, type SessionRepository } from './application/session-repository';
import { SuspendReporter } from './application/suspend-reporter';
import { AuthController } from './http/auth.controller';
import { RolesController } from './http/roles.controller';
import { SessionGuard } from './http/session.guard';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { DrizzleAccountRepository } from './infrastructure/drizzle-account-repository';
import { DrizzleSessionRepository } from './infrastructure/drizzle-session-repository';
import { InMemoryAttemptLimiter } from './infrastructure/in-memory-attempt-limiter';

const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
const ATTEMPT_LIMITER = Symbol('ATTEMPT_LIMITER');
const CLOCK = Symbol('CLOCK');

@Module({
  controllers: [AuthController, RolesController],
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
    {
      provide: ReporterIdentity,
      inject: [DATABASE, ConfigService],
      useFactory: (db: Database, config: ConfigService<Env, true>): ReporterIdentity =>
        new ReporterIdentity({
          accounts: new DrizzleAccountRepository(db),
          secret: config.get('REPORTER_KEY_SECRET', { infer: true }),
        }),
    },
    {
      provide: ChangeRole,
      inject: [ACCOUNT_REPOSITORY, ATTEMPT_LIMITER, CLOCK],
      useFactory: (
        accounts: AccountRepository,
        limiter: AttemptLimiter,
        clock: Clock,
      ): ChangeRole => new ChangeRole({ accounts, limiter, clock }),
    },
    SessionGuard,
  ],
  // Otros módulos protegen sus rutas con el guard (en la #16, POST /reports de pricing).
  exports: [ResolveSession, SessionGuard, ReporterIdentity, ChangeRole],
})
export class IdentityModule implements OnModuleInit {
  constructor(private readonly bus: EventBus) {}

  // Grill de la #33, pregunta 6: reliability pide suspender a un autor por su clave seudónima. La
  // suspensión y la revocación de sesiones van en la transacción del suscriptor.
  onModuleInit(): void {
    this.bus.subscribe(
      'identity.accounts',
      'ReporterSuspensionRequested',
      async (event: DomainEvent, tx: Transaction) => {
        const payload = event.payload as { reporterKey: string; suspendedUntil: string };
        await new SuspendReporter({
          accounts: new DrizzleAccountRepository(tx),
          sessions: new DrizzleSessionRepository(tx),
          clock: { now: () => new Date() },
        }).execute({
          reporterKey: payload.reporterKey,
          suspendedUntil: new Date(payload.suspendedUntil),
        });
      },
    );
    // Grill de la #71, pregunta 4: una apelación aceptada levanta la suspensión de ese descarte.
    this.bus.subscribe(
      'identity.accounts',
      'ReporterSuspensionLifted',
      async (event: DomainEvent, tx: Transaction) => {
        const payload = event.payload as { reporterKey: string; suspendedUntil: string };
        await new LiftSuspension({ accounts: new DrizzleAccountRepository(tx) }).execute({
          reporterKey: payload.reporterKey,
          suspendedUntil: new Date(payload.suspendedUntil),
        });
      },
    );
  }
}
