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
      sql`truncate identity.email_verifications, identity.sessions, identity.accounts`,
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
  });
});
