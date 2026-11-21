import { ConsoleLogger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

const newAccount = () => ({
  email: 'Ana@Correo.com',
  displayName: '  Ana   María ',
  password: 'una-clave-larga',
  acceptedPolicyVersion: '2026-11',
});

const NAME_MESSAGE = 'displayName: debe tener de 2 a 40 letras, sin números, correos ni símbolos';

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
    await db.execute(
      sql`truncate identity.external_identities, identity.email_verifications, identity.sessions, identity.accounts`,
    );
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
      // #133: el nombre visible es obligatorio y solo lleva letras, espacios, apóstrofo y guion.
      ['sin nombre', { displayName: undefined }, NAME_MESSAGE],
      ['un teléfono como nombre', { displayName: '3001234567' }, NAME_MESSAGE],
      ['un correo como nombre', { displayName: 'ana@correo.com' }, NAME_MESSAGE],
      ['un nombre de una letra', { displayName: 'A' }, NAME_MESSAGE],
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

    // Grill de la #33, pregunta 4.
    // Grill de la #71, pregunta 5: entra con una sesión limitada que dice hasta cuándo.
    it('una cuenta suspendida inicia sesión y su sesión dice hasta cuándo está suspendida', async () => {
      await register();
      await db.execute(sql`update identity.accounts set suspended_until = '2099-01-01T00:00:00Z'`);

      const response = await login().expect(204);
      const [setCookie] = response.headers['set-cookie'] as unknown as string[];
      const cookie = (setCookie ?? '').split(';')[0] ?? '';
      const session = await request(server)
        .get('/v1/auth/session')
        .set('Cookie', cookie)
        .expect(200);

      expect(session.body).toMatchObject({
        role: 'reportante',
        suspendedUntil: '2099-01-01T00:00:00.000Z',
      });
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
        // #133: el nombre visible, sin espacios sobrantes; solo en la propia sesión.
        displayName: 'Ana María',
        // ADR-029: la cuenta recién registrada aún no verificó su correo.
        emailVerified: false,
        emailVerificationRequired: true,
        csrfToken: expect.stringMatching(/^[\w-]{43}$/) as unknown,
      });
    });

    it('una cuenta creada antes del nombre visible no trae displayName', async () => {
      const cookie = await signedIn();
      await db.execute(sql`update identity.accounts set display_name = null`);

      const response = await request(server)
        .get('/v1/auth/session')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).not.toHaveProperty('displayName');
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

  describe('POST /v1/auth/logout', () => {
    it('sin X-CSRF-Token responde 403 CSRF_TOKEN_INVALID y la sesión sigue activa', async () => {
      const cookie = await signedIn();

      const response = await request(server)
        .post('/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body).toEqual({
        code: 'CSRF_TOKEN_INVALID',
        message: 'Falta el token CSRF o no coincide con la sesión.',
      });
      await request(server).get('/v1/auth/session').set('Cookie', cookie).expect(200);
    });

    it('con el token CSRF responde 204, borra la cookie y la sesión deja de servir', async () => {
      const cookie = await signedIn();
      const session = await request(server).get('/v1/auth/session').set('Cookie', cookie);
      const { csrfToken } = session.body as { csrfToken: string };

      const response = await request(server)
        .post('/v1/auth/logout')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .expect(204);

      const [cleared] = response.headers['set-cookie'] as unknown as string[];
      expect(cleared).toMatch(/^valora_session=; Max-Age=0; /);
      await request(server).get('/v1/auth/session').set('Cookie', cookie).expect(401);
    });
  });

  // EC-08: ninguna respuesta lleva el correo, el id de la cuenta ni el hash, y la contraseña no
  // aparece en el log.
  it('las respuestas no exponen datos de la cuenta y el log no muestra la contraseña', async () => {
    const written: string[] = [];
    const capture = (chunk: unknown): boolean => {
      written.push(String(chunk));
      return true;
    };
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture);

    // Con el registro real de NestJS, como en la prueba de /nearby (#50).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .setLogger(new ConsoleLogger())
      .compile();
    const loggedApp = moduleRef.createNestApplication({
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    configureApp(loggedApp);
    await loggedApp.init();
    const loggedServer = loggedApp.getHttpServer() as Parameters<typeof request>[0];
    const registered = await request(loggedServer).post('/v1/auth/register').send(newAccount());
    const failed = await request(loggedServer)
      .post('/v1/auth/login')
      .send({ email: 'ana@correo.com', password: 'una-clave-equivocada' });
    const loggedIn = await request(loggedServer)
      .post('/v1/auth/login')
      .send({ email: 'ana@correo.com', password: 'una-clave-larga' });
    const [cookie] = loggedIn.headers['set-cookie'] as unknown as string[];
    const session = await request(loggedServer)
      .get('/v1/auth/session')
      .set('Cookie', (cookie ?? '').split(';')[0] ?? '');
    await loggedApp.close();
    stdout.mockRestore();
    stderr.mockRestore();

    const account = await db.execute<{ id: string; password_hash: string }>(
      sql`select id, password_hash from identity.accounts`,
    );
    expect(account.rows).toHaveLength(1);
    expect(session.status).toBe(200);
    const responses = JSON.stringify([registered.body, failed.body, loggedIn.body, session.body]);
    for (const secret of ['ana@correo.com', account.rows[0]?.id, account.rows[0]?.password_hash]) {
      expect(responses).not.toContain(secret);
    }
    const output = written.join('');
    expect(output).not.toContain('una-clave-larga');
    expect(output).not.toContain('una-clave-equivocada');
  });
});
