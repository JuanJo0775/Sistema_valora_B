import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ChangeRole, IdentityModule, type Role } from './modules/identity';
import { validateEnv } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { EventsModule } from './shared/events';

const USAGE = 'Uso: pnpm identity:set-role <correo> <reportante|moderador> "<motivo>"';
// Grill de la #73, pregunta 1: comercio no se asigna hasta el Corte 3.
const ASSIGNABLE_ROLES: readonly string[] = ['reportante', 'moderador'];

// Grill de la #73, pregunta 4: el administrador del sistema cambia un rol desde el servidor. Usa el
// mismo caso de uso que la ruta y queda en la bitácora sin autor («sistema»).
export async function setRole(args: string[], changeRole: ChangeRole): Promise<string> {
  const [email, role, note] = args;
  if (args.length !== 3 || !email || !note || !role || !ASSIGNABLE_ROLES.includes(role)) {
    throw new Error(USAGE);
  }
  await changeRole.execute({ email, role: role as Role, note, changedBy: null });
  return `${email.trim().toLowerCase()} ahora tiene el rol ${role}.`;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    EventsModule,
    IdentityModule,
  ],
})
class SetRoleModule {}

async function main(): Promise<void> {
  const logger = new Logger('Roles');
  const context = await NestFactory.createApplicationContext(SetRoleModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    logger.log(await setRole(process.argv.slice(2), context.get(ChangeRole)));
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

// Solo al ejecutarlo como comando; las pruebas importan setRole.
if (require.main === module) void main();
