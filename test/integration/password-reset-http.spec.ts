import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { EMAIL_SENDER } from '../../src/modules/identity/application/email-sender';
import { RecordingSender } from '../../src/modules/identity/application/verification-doubles.testing';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

const PASSWORD = 'una-clave-larga';
const NEW_PASSWORD = 'una-clave-nueva-larga';

// ADR-033: olvidé mi contraseña, restablecerla con el enlace y cambiarla desde la sesión.
describe('contraseña olvidada, restablecida y cambiada por HTTP (ADR-033)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let sender: RecordingSender;

  // Cada prueba arranca una aplicación nueva: los límites de frecuencia viven en memoria.
  beforeEach(async () => {
    sender = new RecordingSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
  });

  afterEach(async () => {
    await app.close();
  });

  const forgot = (email: string) =>
    request(server).post('/v1/auth/forgot-password').send({ email });
  const reset = (token: string, password = NEW_PASSWORD) =>
    request(server).post('/v1/auth/reset-password').send({ token, password });
  const login = (email = 'ana@correo.com', password = PASSWORD) =>
    request(server).post('/v1/auth/login').send({ email, password });
  const post = (as: SignedIn, path: string, body: object) =>
    request(server)
      .post(path)
      .set('Cookie', as.cookie)
      .set('X-CSRF-Token', as.csrfToken)
      .send(body);

  // Solo los correos de restablecer: los de verificación del registro no cuentan.
  const resetMails = () =>
    sender.sent.filter((mail) => mail.text.includes('/restablecer-contrasena'));
  // El correo sale en segundo plano: se espera a que llegue.
  const resetMailsSent = async (count: number): Promise<void> => {
    for (let i = 0; i < 100 && resetMails().length < count; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(resetMails()).toHaveLength(count);
  };
  const askForLink = async (email = 'ana@correo.com'): Promise<string> => {
    const before = resetMails().length;
    await forgot(email).expect(202);
    await resetMailsSent(before + 1);
    return /token=([\w-]+)/.exec(resetMails().at(-1)?.text ?? '')?.[1] ?? '';
  };
  const sessionOf = (as: SignedIn) =>
    request(server).get('/v1/auth/session').set('Cookie', as.cookie);
  // Una cuenta creada con Google no tiene contraseña; aquí se simula quitándola y con la sesión indicada.
  const withoutPassword = async (ageMinutes: number) => {
    await db.execute(sql`update identity.accounts set password_hash = null`);
    await db.execute(
      sql`update identity.sessions set created_at = now() - make_interval(mins => ${ageMinutes})`,
    );
  };

  describe('POST /v1/auth/forgot-password', () => {
    it('con una cuenta real responde 202 sin cuerpo y envía el enlace a /restablecer-contrasena', async () => {
      await signIn(server, db, 'ana@correo.com');

      const response = await forgot('ana@correo.com').expect(202);
      await resetMailsSent(1);

      expect(response.text).toBe('');
      expect(resetMails()[0]?.to).toBe('ana@correo.com');
      expect(resetMails()[0]?.subject).toBe('Crea una contraseña nueva en Valora');
      expect(resetMails()[0]?.text).toMatch(/\/restablecer-contrasena\?token=[\w-]{43}/);
    });

    it('con una cuenta inexistente responde exactamente lo mismo y no envía nada', async () => {
      await signIn(server, db, 'ana@correo.com');

      const real = await forgot('ana@correo.com');
      await resetMailsSent(1);
      const unknown = await forgot('nadie@correo.com');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(unknown.status).toBe(real.status);
      expect(unknown.text).toBe(real.text);
      expect(unknown.body).toEqual(real.body);
      expect(Object.keys(unknown.headers).sort()).toEqual(Object.keys(real.headers).sort());
      expect(resetMails()).toHaveLength(1);
    });

    it('con una cuenta pendiente de eliminación responde igual y no envía nada', async () => {
      await signIn(server, db, 'ana@correo.com');
      await db.execute(
        sql`update identity.accounts set deletion_scheduled_for = now() + interval '5 days'`,
      );

      await forgot('ana@correo.com').expect(202);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(resetMails()).toHaveLength(0);
      const rows = await db.execute(sql`select count(*)::int as n from identity.password_resets`);
      expect(rows.rows[0]).toEqual({ n: 0 });
    });

    it('si el envío falla igual responde 202', async () => {
      await signIn(server, db, 'ana@correo.com');
      sender.failWith = new Error('proveedor caído');

      await forgot('ana@correo.com').expect(202);
    });

    it('un correo mal escrito o ausente responde 400 VALIDATION_ERROR', async () => {
      const bad = await forgot('no-es-un-correo').expect(400);
      await request(server).post('/v1/auth/forgot-password').send({}).expect(400);

      expect(bad.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('la IP puede pedir 5 veces en 15 minutos; la sexta responde 429 con Retry-After', async () => {
      for (let i = 0; i < 5; i += 1) await forgot(`otro${String(i)}@correo.com`).expect(202);

      const response = await forgot('otro6@correo.com').expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(response.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });
  });

  describe('POST /v1/auth/reset-password', () => {
    it('con el token del correo responde 204, la contraseña nueva entra y la vieja ya no', async () => {
      await signIn(server, db, 'ana@correo.com');
      const token = await askForLink();

      await reset(token).expect(204);

      await login('ana@correo.com', NEW_PASSWORD).expect(204);
      await login('ana@correo.com', PASSWORD).expect(401);
    });

    it('no abre sesión: no hay Set-Cookie', async () => {
      await signIn(server, db, 'ana@correo.com');
      const token = await askForLink();

      const response = await reset(token).expect(204);

      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('revoca todas las sesiones de la cuenta', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      const otherLogin = await login().expect(204);
      const [setCookie] = otherLogin.headers['set-cookie'] as unknown as string[];
      const otherCookie = (setCookie ?? '').split(';')[0] ?? '';
      const token = await askForLink();

      await reset(token).expect(204);

      await sessionOf(ana).expect(401);
      await request(server).get('/v1/auth/session').set('Cookie', otherCookie).expect(401);
    });

    it('no toca las sesiones de otra cuenta', async () => {
      await signIn(server, db, 'ana@correo.com');
      const beto = await signIn(server, db, 'beto@correo.com');
      const token = await askForLink('ana@correo.com');

      await reset(token).expect(204);

      await sessionOf(beto).expect(200);
    });

    it('si el correo no estaba verificado queda verificado', async () => {
      const ana = await signIn(server, db, 'ana@correo.com', 'reportante', undefined, false);
      expect(((await sessionOf(ana)).body as { emailVerified: boolean }).emailVerified).toBe(false);
      const token = await askForLink();

      await reset(token).expect(204);

      await login('ana@correo.com', NEW_PASSWORD).expect(204);
      const again = await db.execute(
        sql`select email_verified_at is not null as verified from identity.accounts`,
      );
      expect(again.rows[0]).toEqual({ verified: true });
    });

    it('una cuenta de Google (sin contraseña) crea su primera contraseña y entra con el correo', async () => {
      await signIn(server, db, 'ana@correo.com');
      await db.execute(sql`update identity.accounts set password_hash = null`);
      const token = await askForLink();

      await reset(token).expect(204);

      await login('ana@correo.com', NEW_PASSWORD).expect(204);
    });

    it('el token es de un solo uso', async () => {
      await signIn(server, db, 'ana@correo.com');
      const token = await askForLink();
      await reset(token).expect(204);

      const second = await reset(token, 'otra-clave-nueva-larga').expect(422);

      expect(second.body).toEqual({
        code: 'INVALID_TOKEN',
        message: 'El enlace no es válido o ya venció. Pide uno nuevo.',
      });
      await login('ana@correo.com', NEW_PASSWORD).expect(204);
    });

    it('un token vencido, usado o inexistente responde el mismo 422', async () => {
      await signIn(server, db, 'ana@correo.com');
      const expired = await askForLink();
      await db.execute(
        sql`update identity.password_resets set expires_at = now() - interval '1 second'`,
      );
      const unknown = 'nunca-existio';

      const expiredResponse = await reset(expired).expect(422);
      const unknownResponse = await reset(unknown).expect(422);

      expect(unknownResponse.body).toEqual(expiredResponse.body);
      expect(expiredResponse.body).toMatchObject({ code: 'INVALID_TOKEN' });
    });

    it('pedir un enlace nuevo invalida el anterior', async () => {
      await signIn(server, db, 'ana@correo.com');
      const first = await askForLink();
      const second = await askForLink();

      await reset(first).expect(422);
      await reset(second).expect(204);
    });

    it('una contraseña débil responde 400 y no gasta el token', async () => {
      await signIn(server, db, 'ana@correo.com');
      const token = await askForLink();

      const weak = await reset(token, 'corta').expect(400);

      expect(weak.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      await reset(token).expect(204);
    });

    it('sin token o con una contraseña que no es texto responde 400', async () => {
      await request(server).post('/v1/auth/reset-password').send({}).expect(400);
      await request(server)
        .post('/v1/auth/reset-password')
        .send({ token: 'x', password: 12 })
        .expect(400);
    });

    it('dos peticiones a la vez con el mismo token: solo una lo gasta', async () => {
      await signIn(server, db, 'ana@correo.com');
      const token = await askForLink();

      const [first, second] = await Promise.all([
        reset(token),
        reset(token, 'otra-clave-nueva-larga'),
      ]);

      expect([first.status, second.status].sort()).toEqual([204, 422]);
    });

    it('pasado el límite por IP (20 en 15 minutos) responde 429 con Retry-After', async () => {
      for (let i = 0; i < 20; i += 1) await reset('x').expect(422);

      const response = await reset('x').expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('POST /v1/me/password', () => {
    it('con la contraseña actual responde 204, cierra las otras sesiones y la actual sigue', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      const otherLogin = await login().expect(204);
      const [setCookie] = otherLogin.headers['set-cookie'] as unknown as string[];
      const otherCookie = (setCookie ?? '').split(';')[0] ?? '';

      await post(ana, '/v1/me/password', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await sessionOf(ana).expect(200);
      await request(server).get('/v1/auth/session').set('Cookie', otherCookie).expect(401);
      await login('ana@correo.com', NEW_PASSWORD).expect(204);
      await login('ana@correo.com', PASSWORD).expect(401);
    });

    it('con la actual incorrecta o ausente responde 403 INVALID_PASSWORD y no cambia nada', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');

      const wrong = await post(ana, '/v1/me/password', {
        currentPassword: 'otra-clave-larga',
        newPassword: NEW_PASSWORD,
      }).expect(403);
      await post(ana, '/v1/me/password', { newPassword: NEW_PASSWORD }).expect(403);

      expect(wrong.body).toMatchObject({ code: 'INVALID_PASSWORD' });
      await login('ana@correo.com', PASSWORD).expect(204);
    });

    it('al sexto intento fallido responde 429 con Retry-After', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      for (let i = 0; i < 5; i += 1) {
        await post(ana, '/v1/me/password', {
          currentPassword: 'otra-clave-larga',
          newPassword: NEW_PASSWORD,
        }).expect(403);
      }

      const response = await post(ana, '/v1/me/password', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('una contraseña nueva débil responde 400', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');

      await post(ana, '/v1/me/password', {
        currentPassword: PASSWORD,
        newPassword: 'corta',
      }).expect(400);
    });

    it('sin sesión responde 401 y sin CSRF responde 403', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');

      await request(server).post('/v1/me/password').send({ newPassword: NEW_PASSWORD }).expect(401);
      const noCsrf = await request(server)
        .post('/v1/me/password')
        .set('Cookie', ana.cookie)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(403);
      expect(noCsrf.body).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });
    });

    it('una cuenta sin contraseña con la sesión reciente crea la suya sin pedir la actual', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      await withoutPassword(5);

      await post(ana, '/v1/me/password', { newPassword: NEW_PASSWORD }).expect(204);

      await sessionOf(ana).expect(200);
      expect(((await sessionOf(ana)).body as { hasPassword: boolean }).hasPassword).toBe(true);
      await login('ana@correo.com', NEW_PASSWORD).expect(204);
    });

    it('una cuenta sin contraseña con la sesión de más de 10 minutos responde 403 REAUTH_REQUIRED', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      await withoutPassword(11);

      const response = await post(ana, '/v1/me/password', { newPassword: NEW_PASSWORD }).expect(
        403,
      );

      expect(response.body).toEqual({
        code: 'REAUTH_REQUIRED',
        message: 'Vuelve a iniciar sesión para continuar.',
      });
      expect(((await sessionOf(ana)).body as { hasPassword: boolean }).hasPassword).toBe(false);
    });
  });

  describe('GET /v1/auth/session', () => {
    it('dice si la cuenta tiene contraseña (hasPassword)', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      expect((await sessionOf(ana)).body).toMatchObject({ hasPassword: true });

      await db.execute(sql`update identity.accounts set password_hash = null`);

      expect((await sessionOf(ana)).body).toMatchObject({ hasPassword: false });
    });
  });

  // EC-08 y ADR-033: el token no se guarda en claro y ninguna respuesta lo trae.
  describe('privacidad', () => {
    it('la base guarda el SHA-256 del token y nada más que fechas; el token no está en ninguna columna', async () => {
      await signIn(server, db, 'ana@correo.com');
      const token = await askForLink();

      const rows = await db.execute(sql`select * from identity.password_resets`);

      expect(rows.rows).toHaveLength(1);
      expect(Object.keys(rows.rows[0] ?? {}).sort()).toEqual([
        'account_id',
        'created_at',
        'expires_at',
        'id',
        'token_hash',
        'used_at',
      ]);
      expect(rows.rows[0]?.['token_hash']).toBe(createHash('sha256').update(token).digest('hex'));
      expect(JSON.stringify(rows.rows)).not.toContain(token);
      const accounts = await db.execute(sql`select * from identity.accounts`);
      expect(JSON.stringify(accounts.rows)).not.toContain(token);
    });

    it('ninguna respuesta de estas rutas trae el correo, el token ni su hash', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      const token = await askForLink();
      const hash = createHash('sha256').update(token).digest('hex');
      const responses = [
        await forgot('ana@correo.com'),
        await forgot('nadie@correo.com'),
        await reset('nunca-existio'),
        await reset(token),
        await reset(token),
        await post(ana, '/v1/me/password', {
          currentPassword: 'mala-clave-larga',
          newPassword: NEW_PASSWORD,
        }),
        await request(server).get('/v1/auth/session').set('Cookie', ana.cookie),
      ];

      const everything = responses
        .map((response) => JSON.stringify([response.body, response.headers, response.text]))
        .join('\n');

      expect(everything).not.toContain('ana@correo.com');
      expect(everything).not.toContain('nadie@correo.com');
      expect(everything).not.toContain(token);
      expect(everything).not.toContain(hash);
    });

    it('al purgar la cuenta se borran sus enlaces de restablecimiento', async () => {
      await signIn(server, db, 'ana@correo.com');
      await askForLink();
      await db.execute(sql`delete from identity.sessions`);
      await db.execute(sql`delete from identity.email_verifications`);

      await db.execute(sql`delete from identity.accounts`);

      const rows = await db.execute(sql`select count(*)::int as n from identity.password_resets`);
      expect(rows.rows[0]).toEqual({ n: 0 });
    });
  });
});
