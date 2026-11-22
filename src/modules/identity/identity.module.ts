import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.validation';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus } from '../../shared/events';
import {
  ACCOUNT_DELETION_REPOSITORY,
  type AccountDeletionRepository,
} from './application/account-deletion-repository';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './application/account-repository';
import type { AttemptLimiter } from './application/attempt-limiter';
import { ChangeRole } from './application/change-role';
import { GrantMerchantRole } from './application/grant-merchant-role';
import { DeleteOwnAccount } from './application/delete-own-account';
import { PurgeDeletedAccounts } from './application/purge-deleted-accounts';
import { RestoreAccount } from './application/restore-account';
import { CLOCK, type Clock } from './application/clock';
import { GOOGLE_ACCOUNT_LINKS, type GoogleAccountLinks } from './application/google-account-links';
import { SignInWithGoogle } from './application/sign-in-with-google';
import { CompleteGoogleSignUp } from './application/complete-google-sign-up';
import {
  GOOGLE_IDENTITY_PROVIDER,
  type GoogleIdentityProvider,
} from './application/google-identity-provider';
import { EMAIL_SENDER, type EmailSender } from './application/email-sender';
import {
  EMAIL_VERIFICATION_REPOSITORY,
  type EmailVerificationRepository,
} from './application/email-verification-repository';
import type { PasswordHasher } from './application/password-hasher';
import { LiftSuspension } from './application/lift-suspension';
import { Login } from './application/login';
import { Logout } from './application/logout';
import { OwnDisplayName } from './application/own-display-name';
import { RegisterAccount } from './application/register-account';
import { ReporterIdentity } from './application/reporter-identity';
import { ResendVerification } from './application/resend-verification';
import { ResolveSession } from './application/resolve-session';
import { SESSION_REPOSITORY, type SessionRepository } from './application/session-repository';
import { SendVerificationEmail } from './application/send-verification-email';
import { SuspendReporter } from './application/suspend-reporter';
import { VerifyEmail } from './application/verify-email';
import { AuthController } from './http/auth.controller';
import { GoogleAuthController } from './http/google-auth.controller';
import { MeController } from './http/me.controller';
import { RolesController } from './http/roles.controller';
import { SessionGuard } from './http/session.guard';
import { VerifiedEmailGuard } from './http/verified-email.guard';
import { AccountPurgeScheduler } from './infrastructure/account-purge-scheduler';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { ConsoleEmailSender } from './infrastructure/console-email-sender';
import { DrizzleAccountDeletionRepository } from './infrastructure/drizzle-account-deletion-repository';
import { DrizzleAccountRepository } from './infrastructure/drizzle-account-repository';
import { DrizzleEmailVerificationRepository } from './infrastructure/drizzle-email-verification-repository';
import { DrizzleGoogleAccountLinks } from './infrastructure/drizzle-google-account-links';
import { DrizzleSessionRepository } from './infrastructure/drizzle-session-repository';
import { InMemoryAttemptLimiter } from './infrastructure/in-memory-attempt-limiter';
import { JoseGoogleIdentityProvider } from './infrastructure/jose-google-identity-provider';
import { ResendEmailSender } from './infrastructure/resend-email-sender';

const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
const ATTEMPT_LIMITER = Symbol('ATTEMPT_LIMITER');

// ADR-029: elige el proveedor de correo según el entorno, como ImageStorage (ADR-022). La validación
// de las variables ya exigió la clave, el remitente y APP_URL con «resend».
function emailSender(config: ConfigService<Env, true>): EmailSender {
  const apiKey = config.get('EMAIL_API_KEY', { infer: true });
  const from = config.get('EMAIL_FROM', { infer: true });
  if (config.get('EMAIL_PROVIDER', { infer: true }) === 'resend' && apiKey && from) {
    return new ResendEmailSender({ apiKey, from });
  }
  const logger = new Logger('ConsoleEmailSender');
  return new ConsoleEmailSender({
    showLink: ['development', 'test'].includes(config.get('NODE_ENV', { infer: true })),
    log: (line) => {
      logger.log(line);
    },
  });
}

// Dirección de la PWA para los enlaces; en desarrollo, la de Vite.
const DEFAULT_APP_URL = 'http://localhost:5173';

@Module({
  controllers: [AuthController, GoogleAuthController, MeController, RolesController],
  providers: [
    { provide: CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    // ADR-029, fase 2 (#181): null sin las tres variables de Google; las rutas de Google responden 404.
    {
      provide: GOOGLE_IDENTITY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): GoogleIdentityProvider | null => {
        const clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
        const clientSecret = config.get('GOOGLE_CLIENT_SECRET', { infer: true });
        const redirectUri = config.get('GOOGLE_REDIRECT_URI', { infer: true });
        return clientId && clientSecret && redirectUri
          ? new JoseGoogleIdentityProvider({ clientId, clientSecret, redirectUri })
          : null;
      },
    },
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
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: emailSender,
    },
    {
      provide: EMAIL_VERIFICATION_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): EmailVerificationRepository =>
        new DrizzleEmailVerificationRepository(db),
    },
    {
      provide: SendVerificationEmail,
      inject: [EMAIL_VERIFICATION_REPOSITORY, EMAIL_SENDER, CLOCK, ConfigService],
      useFactory: (
        verifications: EmailVerificationRepository,
        sender: EmailSender,
        clock: Clock,
        config: ConfigService<Env, true>,
      ): SendVerificationEmail => {
        const appUrl: string | undefined = config.get('APP_URL', { infer: true });
        return new SendVerificationEmail({
          verifications,
          sender,
          clock,
          appUrl: appUrl ?? DEFAULT_APP_URL,
        });
      },
    },
    {
      provide: VerifyEmail,
      inject: [EMAIL_VERIFICATION_REPOSITORY, ATTEMPT_LIMITER, CLOCK],
      useFactory: (
        verifications: EmailVerificationRepository,
        limiter: AttemptLimiter,
        clock: Clock,
      ): VerifyEmail => new VerifyEmail({ verifications, limiter, clock }),
    },
    {
      provide: ResendVerification,
      inject: [EMAIL_VERIFICATION_REPOSITORY, ATTEMPT_LIMITER, SendVerificationEmail],
      useFactory: (
        verifications: EmailVerificationRepository,
        limiter: AttemptLimiter,
        send: SendVerificationEmail,
      ): ResendVerification => new ResendVerification({ verifications, limiter, send }),
    },
    {
      provide: RegisterAccount,
      inject: [ACCOUNT_REPOSITORY, PASSWORD_HASHER, ATTEMPT_LIMITER, CLOCK, SendVerificationEmail],
      useFactory: (
        accounts: AccountRepository,
        hasher: PasswordHasher,
        limiter: AttemptLimiter,
        clock: Clock,
        verification: SendVerificationEmail,
      ): RegisterAccount => {
        const logger = new Logger(RegisterAccount.name);
        return new RegisterAccount({
          accounts,
          hasher,
          limiter,
          clock,
          verification,
          log: {
            warn: (message) => {
              logger.warn(message);
            },
          },
        });
      },
    },
    // #133: el nombre visible, solo para la propia sesión (EC-08).
    {
      provide: OwnDisplayName,
      inject: [DATABASE],
      useFactory: (db: Database): OwnDisplayName =>
        new OwnDisplayName({ displayNames: new DrizzleAccountRepository(db) }),
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
    // ADR-029, fase 2 (#180, #181): entrar con Google.
    {
      provide: GOOGLE_ACCOUNT_LINKS,
      inject: [DATABASE],
      useFactory: (db: Database): GoogleAccountLinks => new DrizzleGoogleAccountLinks(db),
    },
    {
      provide: SignInWithGoogle,
      inject: [GOOGLE_ACCOUNT_LINKS, SESSION_REPOSITORY, CLOCK],
      useFactory: (
        links: GoogleAccountLinks,
        sessions: SessionRepository,
        clock: Clock,
      ): SignInWithGoogle => new SignInWithGoogle({ links, sessions, clock }),
    },
    {
      provide: CompleteGoogleSignUp,
      inject: [GOOGLE_ACCOUNT_LINKS, SESSION_REPOSITORY, CLOCK, SignInWithGoogle, ATTEMPT_LIMITER],
      useFactory: (
        links: GoogleAccountLinks,
        sessions: SessionRepository,
        clock: Clock,
        signIn: SignInWithGoogle,
        limiter: AttemptLimiter,
      ): CompleteGoogleSignUp =>
        new CompleteGoogleSignUp({ links, sessions, clock, signIn, limiter }),
    },
    // ADR-032: eliminación de la cuenta con 10 días de gracia, restauración y purga.
    {
      provide: ACCOUNT_DELETION_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): AccountDeletionRepository =>
        new DrizzleAccountDeletionRepository(db),
    },
    {
      provide: DeleteOwnAccount,
      inject: [ACCOUNT_DELETION_REPOSITORY, PASSWORD_HASHER, ATTEMPT_LIMITER, CLOCK],
      useFactory: (
        deletion: AccountDeletionRepository,
        hasher: PasswordHasher,
        limiter: AttemptLimiter,
        clock: Clock,
      ): DeleteOwnAccount => new DeleteOwnAccount({ deletion, hasher, limiter, clock }),
    },
    {
      provide: RestoreAccount,
      inject: [
        ACCOUNT_REPOSITORY,
        ACCOUNT_DELETION_REPOSITORY,
        PASSWORD_HASHER,
        SESSION_REPOSITORY,
        ATTEMPT_LIMITER,
        CLOCK,
      ],
      useFactory: (
        accounts: AccountRepository,
        deletion: AccountDeletionRepository,
        hasher: PasswordHasher,
        sessions: SessionRepository,
        limiter: AttemptLimiter,
        clock: Clock,
      ): RestoreAccount =>
        new RestoreAccount({ accounts, deletion, hasher, sessions, limiter, clock }),
    },
    {
      provide: PurgeDeletedAccounts,
      inject: [ACCOUNT_DELETION_REPOSITORY, CLOCK],
      useFactory: (deletion: AccountDeletionRepository, clock: Clock): PurgeDeletedAccounts =>
        new PurgeDeletedAccounts({ deletion, clock }),
    },
    AccountPurgeScheduler,
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
    VerifiedEmailGuard,
  ],
  // Otros módulos protegen sus rutas con el guard (en la #16, POST /reports de pricing).
  exports: [ResolveSession, SessionGuard, VerifiedEmailGuard, ReporterIdentity, ChangeRole],
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
    // D3 del grill comercial: commerce avisa que verificó una tienda y la cuenta pasa a comercio.
    // Solo se conoce el nombre del evento: identity no importa commerce. El cambio va en la
    // transacción del suscriptor; si falla, el relé lo reintenta (ADR-015).
    this.bus.subscribe(
      'identity.accounts',
      'MerchantVerified',
      async (event: DomainEvent, tx: Transaction) => {
        const payload = event.payload as { accountId: string };
        await new GrantMerchantRole({
          accounts: new DrizzleAccountRepository(tx),
          clock: { now: () => new Date() },
        }).execute(payload.accountId);
      },
    );
  }
}
