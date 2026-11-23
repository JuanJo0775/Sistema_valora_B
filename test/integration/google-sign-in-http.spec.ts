import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import type { GoogleHandshake } from '../../src/modules/identity/application/google-handshake';
import {
  GOOGLE_IDENTITY_PROVIDER,
  GoogleRejectedError,
  type GoogleIdentityProvider,
} from '../../src/modules/identity/application/google-identity-provider';
import type { GoogleIdentity } from '../../src/modules/identity/application/sign-in-with-google';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { signIn } from '../support/sign-in';

// Google simulado: la URL lleva el state para poder volver con él, y solo acepta un código.
class FakeGoogle implements GoogleIdentityProvider {
  identity: GoogleIdentity = {
    subject: '109876543210987654321',
    email: 'ana@correo.com',
    emailVerified: true,
    name: 'Ana María',
  };

  authorizationUrl(handshake: GoogleHandshake): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${handshake.state}`;
  }

  identityFrom(code: string): Promise<GoogleIdentity> {
    if (code !== 'codigo-bueno') return Promise.reject(new GoogleRejectedError('código inválido'));
    return Promise.resolve(this.identity);
  }
}

// ADR-029, fase 2 (#181): entrar con Google por HTTP, con Google simulado.
describe('entrar con Google por HTTP (ADR-029, fase 2)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let google: FakeGoogle;

  // provider null: el servidor no tiene configurado Google (sin las tres variables).
  async function startApp(provider: GoogleIdentityProvider | null) {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_IDENTITY_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
  }

  beforeEach(async () => {
    google = new FakeGoogle();
    await startApp(google);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /v1/auth/google/start', () => {
    it('lleva a Google y guarda el saludo en una cookie firmada de 10 minutos', async () => {
      const response = await request(server).get('/v1/auth/google/start').expect(302);

      expect(response.headers['location']).toMatch(
        /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/,
      );
      expect(response.headers['cache-control']).toBe('no-store');
      const [cookie] = response.headers['set-cookie'] as unknown as string[];
      expect(cookie).toMatch(/^valora_google=[\w-]+\.[\w-]+; /);
      expect(cookie).toContain('Max-Age=600');
      expect(cookie).toContain('Path=/v1/auth/google');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
    });

    it('sin Google configurado responde 404', async () => {
      await app.close();
      await startApp(null);

      const response = await request(server).get('/v1/auth/google/start').expect(404);
      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // Empieza el flujo como el navegador: guarda la cookie del saludo y el state que viajó a Google.
  async function begin(): Promise<{ cookie: string; state: string }> {
    const response = await request(server).get('/v1/auth/google/start').expect(302);
    const [setCookie] = response.headers['set-cookie'] as unknown as string[];
    const state = new URL(String(response.headers['location'])).searchParams.get('state') ?? '';
    return { cookie: (setCookie ?? '').split(';')[0] ?? '', state };
  }
  const callback = (query: Record<string, string>, cookie?: string) => {
    const call = request(server).get('/v1/auth/google/callback').query(query);
    return cookie ? call.set('Cookie', cookie) : call;
  };
  const openSessions = async () => {
    const result = await db.execute<{ open: number }>(
      sql`select count(*)::int as open from identity.sessions`,
    );
    return result.rows[0]?.open;
  };

  describe('GET /v1/auth/google/callback sin éxito', () => {
    it('si la persona canceló en Google vuelve a /entrar sin error y borra la cookie del saludo', async () => {
      const { cookie } = await begin();

      const response = await callback({ error: 'access_denied' }, cookie).expect(302);

      expect(response.headers['location']).toBe('/entrar');
      const [cleared] = response.headers['set-cookie'] as unknown as string[];
      expect(cleared).toMatch(/^valora_google=; /);
      expect(cleared).toContain('Max-Age=0');
    });

    it.each([
      ['el state no coincide', (state: string) => ({ code: 'codigo-bueno', state: `${state}x` })],
      ['falta el código', (state: string) => ({ state })],
      ['Google no acepta el código', (state: string) => ({ code: 'codigo-malo', state })],
    ])('si %s vuelve a /entrar?error=google sin abrir sesión', async (_case, query) => {
      const { cookie, state } = await begin();

      const response = await callback(query(state), cookie).expect(302);

      expect(response.headers['location']).toBe('/entrar?error=google');
      expect(await openSessions()).toBe(0);
    });

    it('sin la cookie del saludo (otro navegador o vencida) vuelve a /entrar?error=google', async () => {
      const { state } = await begin();

      const response = await callback({ code: 'codigo-bueno', state }).expect(302);

      expect(response.headers['location']).toBe('/entrar?error=google');
    });
  });

  describe('GET /v1/auth/google/callback cuando el caso de uso no deja entrar', () => {
    it('si Google no verificó el correo vuelve a /entrar con google-correo-sin-verificar', async () => {
      google.identity = { ...google.identity, emailVerified: false };
      const { cookie, state } = await begin();

      const response = await callback({ code: 'codigo-bueno', state }, cookie).expect(302);

      expect(response.headers['location']).toBe('/entrar?error=google-correo-sin-verificar');
      expect(await openSessions()).toBe(0);
    });

    // ADR-032: la PWA ofrece restaurarla; la fecha no viaja en la URL. Una cuenta con contraseña que solo
    // coincide por el correo (sin vínculo con Google) se restaura con POST /auth/restore-account.
    it('una cuenta con contraseña con eliminación pendiente, encontrada por el correo, vuelve a /entrar con eliminacion-pendiente', async () => {
      await signIn(server, db, 'ana@correo.com');
      await db.execute(
        sql`update identity.accounts set deletion_scheduled_for = now() + interval '5 days' where email = 'ana@correo.com'`,
      );
      await db.execute(sql`update identity.sessions set revoked_at = now()`);
      const { cookie, state } = await begin();

      const response = await callback({ code: 'codigo-bueno', state }, cookie).expect(302);

      expect(response.headers['location']).toBe('/entrar?error=eliminacion-pendiente');
      const open = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from identity.sessions where revoked_at is null`,
      );
      expect(open.rows[0]?.n).toBe(0);
    });
  });

  describe('GET /v1/auth/google/callback con éxito', () => {
    // Vuelve de Google con el código bueno y el state correcto, como el navegador.
    async function returnFromGoogle() {
      const { cookie, state } = await begin();
      return callback({ code: 'codigo-bueno', state }, cookie).expect(302);
    }
    const sessionCookieOf = (response: request.Response) =>
      (response.headers['set-cookie'] as unknown as string[])
        .find((cookie) => cookie.startsWith('valora_session='))
        ?.split(';')[0];

    it('una cuenta ya vinculada vuelve a / con la cookie de sesión de siempre, y la sesión sirve', async () => {
      await signIn(server, db, 'ana@correo.com');
      await db.execute(
        sql`update identity.accounts set google_subject = ${google.identity.subject} where email = 'ana@correo.com'`,
      );

      const response = await returnFromGoogle();

      expect(response.headers['location']).toBe('/');
      const cookie = sessionCookieOf(response);
      expect(cookie).toMatch(/^valora_session=[\w-]{43}$/);
      await request(server)
        .get('/v1/auth/session')
        .set('Cookie', cookie ?? '')
        .expect(200);
    });

    // ADR-033: una cuenta de Google no tiene contraseña para POST /auth/restore-account; volver a entrar con
    // Google durante la gracia cancela la eliminación y abre la sesión.
    it('una cuenta de Google con eliminación pendiente queda restaurada y con sesión', async () => {
      await signIn(server, db, 'ana@correo.com');
      await db.execute(
        sql`update identity.accounts set password_hash = null, google_subject = ${google.identity.subject},
            deletion_scheduled_for = now() + interval '5 days' where email = 'ana@correo.com'`,
      );
      await db.execute(sql`update identity.sessions set revoked_at = now()`);

      const response = await returnFromGoogle();

      expect(response.headers['location']).toBe('/');
      const cookie = sessionCookieOf(response);
      expect(cookie).toMatch(/^valora_session=[\w-]{43}$/);
      const session = await request(server)
        .get('/v1/auth/session')
        .set('Cookie', cookie ?? '')
        .expect(200);
      expect(session.body).toMatchObject({ hasPassword: false });
      const row = await db.execute<{ deletion_scheduled_for: Date | null }>(
        sql`select deletion_scheduled_for from identity.accounts where email = 'ana@correo.com'`,
      );
      expect(row.rows[0]?.deletion_scheduled_for).toBeNull();
    });

    // RF-001 y grill de la #178, pregunta 2: pulsar el botón de Google no es aceptar la política.
    it('un correo sin cuenta va a /bienvenida con el registro pendiente firmado, sin sesión ni datos en la URL', async () => {
      const response = await returnFromGoogle();

      expect(response.headers['location']).toBe('/bienvenida');
      const cookies = response.headers['set-cookie'] as unknown as string[];
      const pending = cookies.find((cookie) => cookie.startsWith('valora_google_signup='));
      expect(pending).toMatch(/^valora_google_signup=[\w-]+\.[\w-]+; /);
      expect(pending).toContain('Max-Age=600');
      expect(pending).toContain('Path=/v1/auth/google');
      expect(pending).toContain('HttpOnly');
      // EC-08: ni el correo ni el sub viajan a la vista: van dentro de la cookie firmada.
      expect(pending).not.toContain('ana@correo.com');
      expect(String(response.headers['location'])).not.toMatch(/correo|109876/);
      expect(sessionCookieOf(response)).toBeUndefined();
      expect(await openSessions()).toBe(0);
      const accounts = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from identity.accounts`,
      );
      expect(accounts.rows[0]?.n).toBe(0);
    });
  });

  describe('POST /v1/auth/google/complete', () => {
    const body = { displayName: 'Ana María', acceptedPolicyVersion: '2026-11' };
    // Recorre el flujo hasta /bienvenida y devuelve la cookie del registro pendiente.
    async function pendingSignUp(): Promise<string> {
      const { cookie, state } = await begin();
      const response = await callback({ code: 'codigo-bueno', state }, cookie).expect(302);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      const pending = cookies.find((value) => value.startsWith('valora_google_signup='));
      return (pending ?? '').split(';')[0] ?? '';
    }

    it('sin el registro pendiente (o con uno alterado) responde 401 y no crea nada', async () => {
      await request(server).post('/v1/auth/google/complete').send(body).expect(401);
      await request(server)
        .post('/v1/auth/google/complete')
        .set('Cookie', 'valora_google_signup=datos.firma-falsa')
        .send(body)
        .expect(401);

      const accounts = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from identity.accounts`,
      );
      expect(accounts.rows[0]?.n).toBe(0);
    });

    it('con la política aceptada crea la cuenta sin contraseña, verificada y vinculada, y abre la sesión', async () => {
      const pending = await pendingSignUp();

      const response = await request(server)
        .post('/v1/auth/google/complete')
        .set('Cookie', pending)
        .send(body)
        .expect(204);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.find((value) => value.startsWith('valora_google_signup='))).toContain(
        'Max-Age=0',
      );
      const session = cookies.find((value) => value.startsWith('valora_session='))?.split(';')[0];
      const me = await request(server)
        .get('/v1/auth/session')
        .set('Cookie', session ?? '')
        .expect(200);
      expect(me.body).toMatchObject({
        role: 'reportante',
        emailVerified: true,
        displayName: 'Ana María',
      });
      const [account] = (
        await db.execute<{ password_hash: string | null; google_subject: string }>(
          sql`select password_hash, google_subject from identity.accounts where email = 'ana@correo.com'`,
        )
      ).rows;
      expect(account).toEqual({ password_hash: null, google_subject: google.identity.subject });
    });

    // El mismo límite que POST /auth/register: 10 registros por IP en 15 minutos.
    it('al undécimo registro desde la misma IP responde 429 con Retry-After', async () => {
      const pending = await pendingSignUp();
      const complete = () =>
        request(server).post('/v1/auth/google/complete').set('Cookie', pending).send(body);
      for (let attempt = 0; attempt < 10; attempt += 1) await complete().expect(204);

      const response = await complete().expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('sin aceptar la política vigente o con un nombre inválido responde 400', async () => {
      const pending = await pendingSignUp();

      for (const invalid of [
        { ...body, acceptedPolicyVersion: '2020-01' },
        { ...body, displayName: 'x' },
        { acceptedPolicyVersion: '2026-11' },
      ]) {
        const response = await request(server)
          .post('/v1/auth/google/complete')
          .set('Cookie', pending)
          .send(invalid)
          .expect(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
    });
  });
});
