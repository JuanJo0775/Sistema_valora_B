import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { EMAIL_SENDER } from '../../src/modules/identity/application/email-sender';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { RecordingSender } from '../../src/modules/identity/application/verification-doubles.testing';

const account = () => ({
  email: 'ana@correo.com',
  displayName: 'Ana',
  password: 'una-clave-larga',
  acceptedPolicyVersion: '2026-11',
});

// ADR-029: el flujo completo de la verificación de correo por HTTP, con un remitente en memoria.
describe('verificación de correo por HTTP (ADR-029)', () => {
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
      sql`truncate identity.email_verifications, identity.sessions, identity.accounts`,
    );
  });

  afterEach(async () => {
    await app.close();
  });

  // El registro envía el correo en segundo plano: se espera a que llegue.
  const mailsSent = async (count: number): Promise<void> => {
    for (let i = 0; i < 100 && sender.sent.length < count; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(sender.sent).toHaveLength(count);
  };

  const registerAndLogin = async () => {
    await request(server).post('/v1/auth/register').send(account()).expect(201);
    const login = await request(server)
      .post('/v1/auth/login')
      .send({ email: 'ana@correo.com', password: 'una-clave-larga' })
      .expect(204);
    const [setCookie] = login.headers['set-cookie'] as unknown as string[];
    const cookie = (setCookie ?? '').split(';')[0] ?? '';
    const session = await request(server).get('/v1/auth/session').set('Cookie', cookie);
    return { cookie, csrfToken: (session.body as { csrfToken: string }).csrfToken };
  };

  const emailVerified = async (cookie: string): Promise<boolean> => {
    const session = await request(server).get('/v1/auth/session').set('Cookie', cookie);
    return (session.body as { emailVerified: boolean }).emailVerified;
  };

  it('el registro envía el enlace; verificarlo (204) deja la sesión con emailVerified true', async () => {
    const { cookie } = await registerAndLogin();
    await mailsSent(1);
    expect(sender.sent[0]?.to).toBe('ana@correo.com');
    expect(sender.sent[0]?.text).toMatch(/\/verificar-correo\?token=[\w-]{43}/);
    expect(await emailVerified(cookie)).toBe(false);

    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: sender.lastToken() })
      .expect(204);

    expect(await emailVerified(cookie)).toBe(true);
    // Sin CSRF ni sesión: el token es la credencial.
  });

  it('un token usado, vencido o desconocido responde el mismo 422 INVALID_VERIFICATION_TOKEN', async () => {
    await registerAndLogin();
    await mailsSent(1);
    const token = sender.lastToken();
    await request(server).post('/v1/auth/verify-email').send({ token }).expect(204);

    const used = await request(server).post('/v1/auth/verify-email').send({ token }).expect(422);
    await db.execute(
      sql`update identity.email_verifications set used_at = null, expires_at = now() - interval '1 hour'`,
    );
    const expired = await request(server).post('/v1/auth/verify-email').send({ token }).expect(422);
    const unknown = await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: 'nunca-existio' })
      .expect(422);

    expect(used.body).toEqual({
      code: 'INVALID_VERIFICATION_TOKEN',
      message: 'El enlace de verificación no es válido o ya venció. Pide uno nuevo.',
    });
    expect(expired.body).toEqual(used.body);
    expect(unknown.body).toEqual(used.body);
  });

  it('sin token o con uno que no es texto responde 400 VALIDATION_ERROR', async () => {
    const missing = await request(server).post('/v1/auth/verify-email').send({}).expect(400);
    await request(server).post('/v1/auth/verify-email').send({ token: 123 }).expect(400);

    expect(missing.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('pasado el límite por IP responde 429 con Retry-After', async () => {
    for (let i = 0; i < 20; i += 1) {
      await request(server).post('/v1/auth/verify-email').send({ token: 'x' }).expect(422);
    }

    const response = await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: 'x' })
      .expect(429);

    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('con un correo ya registrado no envía nada y la respuesta del registro es igual', async () => {
    const first = await request(server).post('/v1/auth/register').send(account()).expect(201);
    await mailsSent(1);

    const repeated = await request(server).post('/v1/auth/register').send(account()).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(repeated.body).toEqual(first.body);
    expect(sender.sent).toHaveLength(1);
  });

  it('si el proveedor de correo falla, el registro responde 201 igual y la cuenta existe', async () => {
    sender.failWith = new Error('proveedor caído');

    await request(server).post('/v1/auth/register').send(account()).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const rows = await db.execute(sql`select id from identity.accounts`);
    expect(rows.rows).toHaveLength(1);
    expect(sender.sent).toEqual([]);
  });

  describe('POST /v1/auth/resend-verification', () => {
    it('exige sesión y el token CSRF', async () => {
      const { cookie } = await registerAndLogin();

      await request(server).post('/v1/auth/resend-verification').expect(401);
      const withoutCsrf = await request(server)
        .post('/v1/auth/resend-verification')
        .set('Cookie', cookie)
        .expect(403);

      expect(withoutCsrf.body).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });
    });

    it('responde 202, manda un enlace nuevo a la cuenta de la sesión y el anterior deja de servir', async () => {
      const { cookie, csrfToken } = await registerAndLogin();
      await mailsSent(1);
      const first = sender.lastToken();

      await request(server)
        .post('/v1/auth/resend-verification')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .expect(202);

      expect(sender.sent).toHaveLength(2);
      expect(sender.sent[1]?.to).toBe('ana@correo.com');
      await request(server).post('/v1/auth/verify-email').send({ token: first }).expect(422);
      await request(server)
        .post('/v1/auth/verify-email')
        .send({ token: sender.lastToken() })
        .expect(204);
    });

    it('con la cuenta ya verificada responde 202 igual y no envía nada', async () => {
      const { cookie, csrfToken } = await registerAndLogin();
      await mailsSent(1);
      await request(server)
        .post('/v1/auth/verify-email')
        .send({ token: sender.lastToken() })
        .expect(204);

      await request(server)
        .post('/v1/auth/resend-verification')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .expect(202);

      expect(sender.sent).toHaveLength(1);
    });

    it('permite 3 por hora por cuenta; el cuarto responde 429 con Retry-After', async () => {
      const { cookie, csrfToken } = await registerAndLogin();
      const resend = () =>
        request(server)
          .post('/v1/auth/resend-verification')
          .set('Cookie', cookie)
          .set('X-CSRF-Token', csrfToken);
      for (let i = 0; i < 3; i += 1) await resend().expect(202);

      const response = await resend().expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  // EC-08 y ADR-029: el token no se guarda en claro y ninguna respuesta pública trae el correo ni el token.
  describe('privacidad', () => {
    it('la base guarda el SHA-256 del token y el token en claro no está en ninguna columna', async () => {
      await registerAndLogin();
      await mailsSent(1);
      const token = sender.lastToken();

      const rows = await db.execute(sql`select * from identity.email_verifications`);

      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.['token_hash']).toBe(createHash('sha256').update(token).digest('hex'));
      expect(JSON.stringify(rows.rows)).not.toContain(token);
      const accounts = await db.execute(sql`select * from identity.accounts`);
      expect(JSON.stringify(accounts.rows)).not.toContain(token);
    });

    it('ninguna respuesta de estas rutas trae el correo ni el token', async () => {
      const registered = await request(server).post('/v1/auth/register').send(account());
      await mailsSent(1);
      const token = sender.lastToken();
      const login = await request(server)
        .post('/v1/auth/login')
        .send({ email: 'ana@correo.com', password: 'una-clave-larga' });
      const [setCookie] = login.headers['set-cookie'] as unknown as string[];
      const cookie = (setCookie ?? '').split(';')[0] ?? '';
      const session = await request(server).get('/v1/auth/session').set('Cookie', cookie);
      const csrfToken = (session.body as { csrfToken: string }).csrfToken;
      const resent = await request(server)
        .post('/v1/auth/resend-verification')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken);
      const verified = await request(server).post('/v1/auth/verify-email').send({ token });
      const invalid = await request(server).post('/v1/auth/verify-email').send({ token });
      const sessionAfter = await request(server).get('/v1/auth/session').set('Cookie', cookie);

      const responses = [registered, login, session, resent, verified, invalid, sessionAfter]
        .map((response) => JSON.stringify([response.body, response.headers, response.text]))
        .join('\n');

      expect(responses).not.toContain('ana@correo.com');
      expect(responses).not.toContain(token);
      expect(responses).not.toContain(sender.lastToken());
    });
  });
});
