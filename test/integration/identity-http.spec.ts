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

  const register = () => request(server).post('/v1/auth/register').send(newAccount()).expect(201);
  const login = (password = 'una-clave-larga', email = 'ana@correo.com') =>
    request(server).post('/v1/auth/login').send({ email, password });

  describe('POST /v1/auth/login', () => {
    it('responde 204 con la cookie de sesión y sus atributos', async () => {
      await register();

      const response = await login().expect(204);

      const [cookie] = response.headers['set-cookie'] as unknown as string[];
      expect(cookie).toMatch(/^valora_session=[\w-]{43}; /);
      expect(cookie).toContain('Max-Age=2592000');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
    });

    it('con una contraseña mala o un correo inexistente responde el mismo 401', async () => {
      await register();

      const wrongPassword = await login('otra-clave-larga').expect(401);
      const unknownEmail = await login('una-clave-larga', 'nadie@correo.com').expect(401);

      const expected = { code: 'UNAUTHORIZED', message: 'Correo o contraseña incorrectos.' };
      expect(wrongPassword.body).toEqual(expected);
      expect(unknownEmail.body).toEqual(expected);
    });

    it('al sexto intento fallido con el mismo correo responde 429 con Retry-After', async () => {
      await register();
      for (let attempt = 0; attempt < 5; attempt += 1) await login('otra-clave-larga').expect(401);

      const response = await login().expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(response.body).toEqual({
        code: 'TOO_MANY_REQUESTS',
        message: 'Límite de frecuencia superado.',
      });
    });
  });

  // Registra a Ana, inicia sesión y devuelve la cookie para las siguientes peticiones.
  const signedIn = async (): Promise<string> => {
    await register();
    const response = await login().expect(204);
    const [cookie] = response.headers['set-cookie'] as unknown as string[];
    return (cookie ?? '').split(';')[0] ?? '';
  };

  describe('GET /v1/auth/session', () => {
    it('con sesión responde 200 con el rol y el token CSRF, sin correo ni id', async () => {
      const cookie = await signedIn();

      const response = await request(server)
        .get('/v1/auth/session')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toEqual({
        role: 'reportante',
        csrfToken: expect.stringMatching(/^[\w-]{43}$/) as unknown,
      });
    });

    it('sin cookie o con una cookie desconocida responde 401', async () => {
      await request(server).get('/v1/auth/session').expect(401);
      const response = await request(server)
        .get('/v1/auth/session')
        .set('Cookie', 'valora_session=inventada')
        .expect(401);

      expect(response.body).toEqual({ code: 'UNAUTHORIZED', message: 'Se requiere sesión.' });
    });
  });
});
