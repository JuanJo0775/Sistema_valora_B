import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ChangeRole } from '../../src/modules/identity';
import { setRole } from '../../src/set-role';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Grill de la #73, pregunta 4: el administrador del sistema crea el primer moderador.
describe('pnpm identity:set-role <correo> <rol> "<motivo>"', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate identity.sessions, identity.accounts, identity.role_changes`);
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/v1/auth/register')
      .send({
        email: 'ana@correo.com',
        displayName: 'Ana',
        password: 'una-clave-larga',
        acceptedPolicyVersion: '2026-11',
      })
      .expect(201);
  });

  it('vuelve moderadora la cuenta y lo anota como cambio del sistema', async () => {
    const message = await setRole(
      ['Ana@Correo.com', 'moderador', 'Primera moderadora del equipo'],
      app.get(ChangeRole),
    );

    expect(message).toBe('ana@correo.com ahora tiene el rol moderador.');
    const account = await db.execute(sql`select role from identity.accounts`);
    expect(account.rows).toEqual([{ role: 'moderador' }]);
    const log = await db.execute(sql`select to_role, changed_by from identity.role_changes`);
    expect(log.rows).toEqual([{ to_role: 'moderador', changed_by: null }]);
  });

  it.each([
    [['ana@correo.com', 'moderador']],
    [['ana@correo.com', 'comercio', 'Motivo suficiente']],
  ])(
    'con argumentos incompletos o un rol que no se asigna explica cómo usarlo (%j)',
    async (args) => {
      await expect(setRole(args, app.get(ChangeRole))).rejects.toThrow(
        'Uso: pnpm identity:set-role <correo> <reportante|moderador> "<motivo>"',
      );
    },
  );
});
