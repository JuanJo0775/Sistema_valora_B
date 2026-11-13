import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

const newAccount = () => ({
  email: 'Ana@Correo.com',
  password: 'una-clave-larga',
  acceptedPolicyVersion: '2026-11',
});

describe('rutas de identity: registro, sesión y CSRF', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;

  // Cada prueba arranca una aplicación nueva: los límites de frecuencia viven en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /v1/auth/register', () => {
    it('crea la cuenta (201) y, con un correo ya registrado, responde 201 igual sin cambiarla', async () => {
      const first = await request(server).post('/v1/auth/register').send(newAccount()).expect(201);
      const repeated = await request(server)
        .post('/v1/auth/register')
        .send({ ...newAccount(), email: 'ana@correo.com', password: 'otra-clave-larga' })
        .expect(201);

      expect(repeated.body).toEqual(first.body);
      const rows = await db.execute<{ email: string; role: string }>(
        sql`select email, role from identity.accounts`,
      );
      expect(rows.rows).toEqual([{ email: 'ana@correo.com', role: 'reportante' }]);
    });

    it.each([
      ['un correo inválido', { email: 'no-es-correo' }, 'email: debe ser un correo válido'],
      [
        'una contraseña corta',
        { password: 'corta' },
        'password: debe tener entre 10 y 128 caracteres',
      ],
      [
        'otra versión de la política',
        { acceptedPolicyVersion: '2025-01' },
        'acceptedPolicyVersion: debe ser la versión vigente de la política (2026-11)',
      ],
      ['un rol en el cuerpo', { role: 'moderador' }, 'role: no está permitido'],
    ])('con %s responde 400', async (_case, change, message) => {
      const response = await request(server)
        .post('/v1/auth/register')
        .send({ ...newAccount(), ...change })
        .expect(400);

      expect(response.body).toEqual({ code: 'VALIDATION_ERROR', message });
    });
  });
});
