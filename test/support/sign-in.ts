import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { Database } from '../../src/shared/database/database.module';

export interface SignedIn {
  // Cookie lista para la cabecera Cookie, y el token para X-CSRF-Token.
  cookie: string;
  csrfToken: string;
  accountId: string;
}

// Crea una cuenta con el rol indicado (moderador y comercio no se crean por la API), inicia sesión y
// pide el token CSRF, como lo hará el frontend.
export async function signIn(
  server: Parameters<typeof request>[0],
  db: Database,
  email: string,
  role = 'reportante',
  // #133: el registro pide un nombre visible.
  displayName = 'Persona de Prueba',
): Promise<SignedIn> {
  const password = 'una-clave-larga';
  await request(server)
    .post('/v1/auth/register')
    .send({ email, displayName, password, acceptedPolicyVersion: '2026-11' })
    .expect(201);
  await db.execute(sql`update identity.accounts set role = ${role} where email = ${email}`);
  const login = await request(server).post('/v1/auth/login').send({ email, password }).expect(204);
  const [setCookie] = login.headers['set-cookie'] as unknown as string[];
  const cookie = (setCookie ?? '').split(';')[0] ?? '';
  const session = await request(server).get('/v1/auth/session').set('Cookie', cookie).expect(200);
  const account = await db.execute<{ id: string }>(
    sql`select id from identity.accounts where email = ${email}`,
  );
  return {
    cookie,
    csrfToken: (session.body as { csrfToken: string }).csrfToken,
    accountId: account.rows[0]?.id ?? '',
  };
}
