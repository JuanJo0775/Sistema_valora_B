import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { EMAIL_SENDER } from '../../src/modules/identity/application/email-sender';
import { RecordingSender } from '../../src/modules/identity/application/verification-doubles.testing';
import { WELCOME_REPOSITORY } from '../../src/modules/identity/application/welcome-repository';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

const SUBJECT = 'Te damos la bienvenida a Valora';
const account = () => ({
  email: 'ana@correo.com',
  displayName: 'Ana María',
  password: 'una-clave-larga',
  acceptedPolicyVersion: '2026-11',
});

// ADR-036: la bienvenida sale una sola vez, cuando el correo queda verificado por primera vez.
describe('correo de bienvenida por HTTP (ADR-036)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let sender: RecordingSender;

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

  const welcomes = () => sender.sent.filter((mail) => mail.subject === SUBJECT);
  const settle = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
  const waitFor = async (count: number): Promise<void> => {
    for (let i = 0; i < 100 && welcomes().length < count; i += 1) await settle();
    await settle();
    expect(welcomes()).toHaveLength(count);
  };
  const markOf = async (): Promise<Date | null> => {
    const rows = await db.execute<{ welcome_email_sent_at: Date | null }>(
      sql`select welcome_email_sent_at from identity.accounts where email = 'ana@correo.com'`,
    );
    return rows.rows[0]?.welcome_email_sent_at ?? null;
  };
  const registerAndGetToken = async (): Promise<string> => {
    await request(server).post('/v1/auth/register').send(account()).expect(201);
    for (let i = 0; i < 100 && sender.sent.length < 1; i += 1) await settle();
    return sender.lastToken();
  };

  it('se envía una vez al verificar el correo y no antes', async () => {
    const token = await registerAndGetToken();
    await settle();
    expect(welcomes()).toHaveLength(0);

    await request(server).post('/v1/auth/verify-email').send({ token }).expect(204);

    await waitFor(1);
    expect(welcomes()[0]?.to).toBe('ana@correo.com');
    expect(welcomes()[0]?.text).toContain('Hola Ana,');
    expect(welcomes()[0]?.html).toContain('Abrir Valora');
    expect(await markOf()).not.toBeNull();
  });

  it('no se reenvía con un segundo enlace ni al restablecer la contraseña después', async () => {
    const token = await registerAndGetToken();
    await request(server).post('/v1/auth/verify-email').send({ token }).expect(204);
    await waitFor(1);

    // Un segundo token de verificación (la cuenta ya estaba verificada).
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: 'otro-token-que-no-existe' })
      .expect(422);
    await request(server)
      .post('/v1/auth/forgot-password')
      .send({ email: 'ana@correo.com' })
      .expect(202);
    for (
      let i = 0;
      i < 100 && !sender.sent.some((m) => m.text.includes('/restablecer-contrasena'));
      i += 1
    ) {
      await settle();
    }
    const resetToken = /restablecer-contrasena\?token=([\w-]+)/.exec(
      sender.sent.at(-1)?.text ?? '',
    )?.[1];
    await request(server)
      .post('/v1/auth/reset-password')
      .send({ token: resetToken, password: 'una-clave-nueva-larga' })
      .expect(204);

    await settle();
    expect(welcomes()).toHaveLength(1);
  });

  it('restablecer la contraseña de una cuenta sin verificar la verifica y envía la bienvenida', async () => {
    await registerAndGetToken();
    await request(server)
      .post('/v1/auth/forgot-password')
      .send({ email: 'ana@correo.com' })
      .expect(202);
    for (
      let i = 0;
      i < 100 && !sender.sent.some((m) => m.text.includes('/restablecer-contrasena'));
      i += 1
    ) {
      await settle();
    }
    const resetToken = /restablecer-contrasena\?token=([\w-]+)/.exec(
      sender.sent.at(-1)?.text ?? '',
    )?.[1];
    await request(server)
      .post('/v1/auth/reset-password')
      .send({ token: resetToken, password: 'una-clave-nueva-larga' })
      .expect(204);

    await waitFor(1);
    expect(welcomes()[0]?.to).toBe('ana@correo.com');
  });

  it('una cuenta que ya existía antes de la migración (con la marca puesta) no la recibe', async () => {
    const token = await registerAndGetToken();
    await db.execute(
      sql`update identity.accounts set welcome_email_sent_at = now() - interval '30 days'`,
    );

    await request(server).post('/v1/auth/verify-email').send({ token }).expect(204);

    await settle();
    expect(welcomes()).toHaveLength(0);
  });

  it('si el proveedor falla, verificar responde 204, el correo queda verificado y no se reintenta', async () => {
    const token = await registerAndGetToken();
    sender.failWith = new Error('proveedor caído');

    await request(server).post('/v1/auth/verify-email').send({ token }).expect(204);
    await settle();

    expect(await markOf()).not.toBeNull();
    const verified = await db.execute<{ email_verified_at: Date | null }>(
      sql`select email_verified_at from identity.accounts`,
    );
    expect(verified.rows[0]?.email_verified_at).not.toBeNull();
    expect(welcomes()).toHaveLength(0);
  });

  it('dos reclamos simultáneos de la misma cuenta dejan pasar solo uno', async () => {
    const token = await registerAndGetToken();
    await request(server).post('/v1/auth/verify-email').send({ token }).expect(204);
    await waitFor(1);
    await db.execute(sql`update identity.accounts set welcome_email_sent_at = null`);
    const id =
      (await db.execute<{ id: string }>(sql`select id from identity.accounts`)).rows[0]?.id ?? '';
    const repository = app.get<{ claim(id: string, at: Date): Promise<unknown> }>(
      WELCOME_REPOSITORY,
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () => repository.claim(id, new Date())),
    );

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it('ninguna respuesta de sesión expone la marca de la bienvenida', async () => {
    const token = await registerAndGetToken();
    await request(server).post('/v1/auth/verify-email').send({ token }).expect(204);
    await waitFor(1);
    const login = await request(server)
      .post('/v1/auth/login')
      .send({ email: 'ana@correo.com', password: 'una-clave-larga' })
      .expect(204);
    const [setCookie] = login.headers['set-cookie'] as unknown as string[];
    const cookie = (setCookie ?? '').split(';')[0] ?? '';

    const session = await request(server).get('/v1/auth/session').set('Cookie', cookie);

    expect(JSON.stringify(session.body)).not.toMatch(/welcome/i);
  });
});
