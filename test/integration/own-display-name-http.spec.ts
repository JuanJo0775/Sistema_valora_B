import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

const NAME_MESSAGE = 'displayName: debe tener de 2 a 40 letras, sin números, correos ni símbolos';

// Rectificación del nombre visible (Ley 1581, art. 8): la persona lo cambia desde la app.
describe('PATCH /v1/me/profile', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;

  // Cada prueba arranca una aplicación nueva: el límite de frecuencia vive en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  const change = (as: SignedIn | null, body: object) => {
    const call = request(server).patch('/v1/me/profile');
    return (as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call).send(body);
  };
  const storedName = async (accountId: string) =>
    (
      await db.execute<{ display_name: string | null }>(
        sql`select display_name from identity.accounts where id = ${accountId}`,
      )
    ).rows[0]?.display_name;
  const sessionName = async (as: SignedIn) =>
    (await request(server).get('/v1/auth/session').set('Cookie', as.cookie).expect(200)).body as {
      displayName?: string;
    };

  it('guarda el nombre sin espacios sobrantes, responde 200 no-store y la sesión lo trae', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');

    const response = await change(ana, { displayName: '  Sara   Luz ' }).expect(200);

    expect(response.body).toEqual({ displayName: 'Sara Luz' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await storedName(ana.accountId)).toBe('Sara Luz');
    expect((await sessionName(ana)).displayName).toBe('Sara Luz');
  });

  it('un nombre igual al actual responde 200 igual', async () => {
    const ana = await signIn(server, db, 'ana@correo.com', 'reportante', 'Ana María');

    const response = await change(ana, { displayName: 'Ana María' }).expect(200);

    expect(response.body).toEqual({ displayName: 'Ana María' });
  });

  it('una cuenta anterior al nombre (null) puede ponerse uno por primera vez', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');
    await db.execute(sql`update identity.accounts set display_name = null`);

    await change(ana, { displayName: 'Ana' }).expect(200);

    expect(await storedName(ana.accountId)).toBe('Ana');
  });

  it('una cuenta suspendida también puede cambiarlo', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');
    await db.execute(sql`update identity.accounts set suspended_until = '2099-01-01T00:00:00Z'`);

    await change(ana, { displayName: 'Ana Suspendida' }).expect(200);

    expect(await storedName(ana.accountId)).toBe('Ana Suspendida');
  });

  it('sin sesión responde 401 y sin el token CSRF responde 403 CSRF_TOKEN_INVALID', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');

    await change(null, { displayName: 'Otra' }).expect(401);
    const withoutCsrf = await request(server)
      .patch('/v1/me/profile')
      .set('Cookie', ana.cookie)
      .send({ displayName: 'Otra' })
      .expect(403);

    expect(withoutCsrf.body).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });
    expect(await storedName(ana.accountId)).toBe('Persona de Prueba');
  });

  it.each([
    ['sin nombre', {}],
    ['un teléfono', { displayName: '3001234567' }],
    ['un correo', { displayName: 'ana@correo.com' }],
    ['una sola letra', { displayName: 'A' }],
    ['solo espacios', { displayName: '    ' }],
    ['más de 40 letras', { displayName: 'a'.repeat(41) }],
    ['un número en vez de texto', { displayName: 12345 }],
  ])('con %s responde 400 VALIDATION_ERROR como el registro y no cambia nada', async (_c, body) => {
    const ana = await signIn(server, db, 'ana@correo.com');

    const response = await change(ana, body).expect(400);

    expect(response.body).toEqual({ code: 'VALIDATION_ERROR', message: NAME_MESSAGE });
    expect(await storedName(ana.accountId)).toBe('Persona de Prueba');
  });

  it('un campo de más (rol) se rechaza', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');

    const response = await change(ana, { displayName: 'Ana', role: 'moderador' }).expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'role: no está permitido',
    });
  });

  it('al cambiarlo solo cambia la cuenta de la sesión', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');
    const luis = await signIn(server, db, 'luis@correo.com', 'reportante', 'Luis Pérez');

    await change(ana, { displayName: 'Ana Nueva' }).expect(200);

    expect(await storedName(luis.accountId)).toBe('Luis Pérez');
  });

  it('más de 10 cambios por hora responden 429 con Retry-After, por cuenta', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');
    const luis = await signIn(server, db, 'luis@correo.com');
    for (let i = 0; i < 10; i += 1) await change(ana, { displayName: 'Ana' }).expect(200);

    const limited = await change(ana, { displayName: 'Otra' }).expect(429);

    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(await storedName(ana.accountId)).toBe('Ana');
    await change(luis, { displayName: 'Luis' }).expect(200);
  });
});
