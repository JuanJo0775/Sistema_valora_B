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
});
