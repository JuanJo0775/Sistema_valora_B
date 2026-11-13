import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './application/account-repository';
import type { AttemptLimiter } from './application/attempt-limiter';
import type { Clock } from './application/clock';
import type { PasswordHasher } from './application/password-hasher';
import { RegisterAccount } from './application/register-account';
import { AuthController } from './http/auth.controller';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { DrizzleAccountRepository } from './infrastructure/drizzle-account-repository';
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
  ],
})
export class IdentityModule {}
