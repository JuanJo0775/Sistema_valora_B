import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ChangeRole, IdentityModule } from './modules/identity';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from './modules/identity/application/account-repository';
import { PASSWORD_LENGTH } from './modules/identity/application/password-policy';
import { RegisterAccount } from './modules/identity/application/register-account';
import { validateEnv } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { EventsModule } from './shared/events';

// Moderador de prueba de la semilla (QA del módulo de comerciante, 2026-11). Ningún dato de la cuenta
// vive en el repositorio: el correo y la contraseña llegan por SEED_MODERATOR_EMAIL y
// SEED_MODERATOR_PASSWORD (variables de entorno o `.env`, que no se versiona) al correr el comando.
const DISPLAY_NAME = 'Moderador de prueba';
const NOTE = 'Moderador de prueba de la semilla (QA)';
const POLICY_VERSION = 'semilla';

export interface SeedModeratorCredentials {
  email: string | undefined;
  password: string | undefined;
}

export interface SeedModeratorPorts {
  accounts: Pick<AccountRepository, 'findByEmail'>;
  register: Pick<RegisterAccount, 'execute'>;
  changeRole: Pick<ChangeRole, 'execute'>;
}

// Idempotente: si la cuenta ya existe no cambia su contraseña; solo se asegura de que sea moderador.
export async function seedModerator(
  { email: rawEmail, password }: SeedModeratorCredentials,
  ports: SeedModeratorPorts,
): Promise<string> {
  const email = rawEmail?.trim().toLowerCase();
  if (!email) throw new Error('Define SEED_MODERATOR_EMAIL con el correo del moderador de prueba.');
  let created = false;
  if (!(await ports.accounts.findByEmail(email))) {
    if (!password || password.length < PASSWORD_LENGTH.min) {
      throw new Error(
        `Define SEED_MODERATOR_PASSWORD (mínimo ${String(PASSWORD_LENGTH.min)} caracteres) para crear la cuenta.`,
      );
    }
    await ports.register.execute({
      email,
      displayName: DISPLAY_NAME,
      password,
      acceptedPolicyVersion: POLICY_VERSION,
      ip: 'semilla',
    });
    created = true;
  }
  const account = await ports.accounts.findByEmail(email);
  if (!account) throw new Error('No se pudo crear la cuenta del moderador de prueba.');
  if (account.role !== 'moderador') {
    await ports.changeRole.execute({ email, role: 'moderador', note: NOTE, changedBy: null });
  }
  // El correo no se muestra: es dato de una cuenta (EC-08).
  return `Cuenta del moderador de prueba ${created ? 'creada' : 'ya existía'}, con rol moderador.`;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    EventsModule,
    IdentityModule,
  ],
})
class SeedModeratorModule {}

async function main(): Promise<void> {
  const logger = new Logger('SeedModerador');
  const context = await NestFactory.createApplicationContext(SeedModeratorModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    logger.log(
      await seedModerator(
        {
          email: process.env.SEED_MODERATOR_EMAIL,
          password: process.env.SEED_MODERATOR_PASSWORD,
        },
        {
          accounts: context.get<AccountRepository>(ACCOUNT_REPOSITORY, { strict: false }),
          register: context.get(RegisterAccount, { strict: false }),
          changeRole: context.get(ChangeRole),
        },
      ),
    );
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

// Solo al ejecutarlo como comando; las pruebas importan seedModerator.
if (require.main === module) void main();
