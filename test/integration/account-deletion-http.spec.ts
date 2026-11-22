import { OutboxPublisher } from '../../src/shared/events';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { PurgeDeletedAccounts } from '../../src/modules/identity/application/purge-deleted-accounts';
import { ACCOUNT_DELETION_GRACE_DAYS } from '../../src/modules/identity/application/delete-own-account';
import { accounts } from '../../src/modules/identity/infrastructure/schema';
import { DrizzleAccountDeletionRepository } from '../../src/modules/identity/infrastructure/drizzle-account-deletion-repository';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

const DAY = 24 * 60 * 60 * 1000;
const productId = 'd0111111-1111-4111-8111-111111111111';
const presentationId = 'd0111111-1111-4111-8111-aaaaaaaaaaaa';
const storeId = 'd0222222-2222-4222-8222-222222222222';
const PASSWORD = 'una-clave-larga';

// ADR-032: eliminar la propia cuenta (Ley 1581, art. 8) con 10 días de gracia.
describe('eliminación de la propia cuenta (ADR-032)', () => {
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
      sql`truncate identity.email_verifications, identity.sessions, identity.accounts, pricing.reports, comparison.price_current, catalog.presentations, catalog.products, catalog.product_aliases, establishments.establishments`,
    );
  });

  afterEach(async () => {
    await app.close();
  });

  const requestDeletion = (as: SignedIn | null, body: object = { password: PASSWORD }) => {
    const call = request(server).post('/v1/me/account-deletion');
    return (as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call).send(body);
  };
  const login = (email = 'ana@correo.com', password = PASSWORD) =>
    request(server).post('/v1/auth/login').send({ email, password });
  const restore = (email = 'ana@correo.com', password = PASSWORD) =>
    request(server).post('/v1/auth/restore-account').send({ email, password });
  const accountRow = async (email = 'ana@correo.com') => {
    const [row] = await db
      .select({ id: accounts.id, deletion_scheduled_for: accounts.deletionScheduledFor })
      .from(accounts)
      .where(eq(accounts.email, email));
    return row;
  };
  const purgeAt = (now: Date) =>
    new PurgeDeletedAccounts({
      deletion: new DrizzleAccountDeletionRepository(db, new OutboxPublisher()),
      clock: { now: () => now },
    }).execute();

  describe('POST /v1/me/account-deletion', () => {
    it('sin sesión responde 401 y sin el token CSRF responde 403 CSRF_TOKEN_INVALID', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');

      await requestDeletion(null).expect(401);
      const withoutCsrf = await request(server)
        .post('/v1/me/account-deletion')
        .set('Cookie', ana.cookie)
        .send({ password: PASSWORD })
        .expect(403);

      expect(withoutCsrf.body).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });
      expect((await accountRow())?.deletion_scheduled_for).toBeNull();
    });

    it('con la contraseña correcta responde 202 con la fecha a 10 días, limpia la cookie y la sesión anterior deja de valer', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      const before = Date.now();

      const response = await requestDeletion(ana).expect(202);

      const body = response.body as { scheduledFor: string };
      expect(Object.keys(body)).toEqual(['scheduledFor']);
      const scheduledFor = new Date(body.scheduledFor).getTime();
      expect(scheduledFor).toBeGreaterThanOrEqual(before + ACCOUNT_DELETION_GRACE_DAYS * DAY);
      expect(scheduledFor).toBeLessThan(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * DAY + 1);
      const [cookie] = response.headers['set-cookie'] as unknown as string[];
      expect(cookie).toMatch(/^valora_session=; /);
      expect(cookie).toContain('Max-Age=0');
      expect(response.headers['cache-control']).toBe('no-store');
      // Nada del interior: ni el correo, ni el nombre, ni el hash, ni el id.
      expect(JSON.stringify(response.body)).not.toMatch(/ana@|Persona|argon|[0-9a-f]{8}-/);

      await request(server).get('/v1/auth/session').set('Cookie', ana.cookie).expect(401);
      const open = await db.execute<{ open: number }>(
        sql`select count(*)::int as open from identity.sessions where revoked_at is null`,
      );
      expect(open.rows[0]?.open).toBe(0);
      // Aún no se borra: la gracia es de 10 días.
      expect((await accountRow())?.deletion_scheduled_for).toEqual(new Date(body.scheduledFor));
    });

    it('con una contraseña mala responde 403 INVALID_PASSWORD y no marca nada ni cierra la sesión', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');

      const response = await requestDeletion(ana, { password: 'otra-clave-larga' }).expect(403);

      expect(response.body).toEqual({
        code: 'INVALID_PASSWORD',
        message: 'La contraseña no es correcta.',
      });
      expect((await accountRow())?.deletion_scheduled_for).toBeNull();
      await request(server).get('/v1/auth/session').set('Cookie', ana.cookie).expect(200);
    });

    it('sin contraseña en el cuerpo responde 400', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');

      const response = await requestDeletion(ana, {}).expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    // ADR-029, fase 2 (#179): una cuenta creada con Google no tiene contraseña y confirma con su correo.
    describe('cuenta sin contraseña', () => {
      const signInWithoutPassword = async () => {
        const ana = await signIn(server, db, 'ana@correo.com');
        await db.execute(sql`update identity.accounts set password_hash = null`);
        return ana;
      };

      it('confirma escribiendo su correo: responde 202 y la cuenta queda pendiente', async () => {
        const ana = await signInWithoutPassword();

        const response = await requestDeletion(ana, { confirmEmail: ' Ana@Correo.com ' }).expect(
          202,
        );

        const body = response.body as { scheduledFor: string };
        expect((await accountRow())?.deletion_scheduled_for).toEqual(new Date(body.scheduledFor));
      });

      it('con otro correo responde 403 INVALID_CONFIRMATION y no marca nada', async () => {
        const ana = await signInWithoutPassword();

        const response = await requestDeletion(ana, { confirmEmail: 'otra@correo.com' }).expect(
          403,
        );

        expect(response.body).toEqual({
          code: 'INVALID_CONFIRMATION',
          message: 'El correo no coincide con el de la cuenta.',
        });
        expect((await accountRow())?.deletion_scheduled_for).toBeNull();
      });
    });

    it('con la contraseña y el correo a la vez responde 400', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');

      const response = await requestDeletion(ana, {
        password: PASSWORD,
        confirmEmail: 'ana@correo.com',
      }).expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect((await accountRow())?.deletion_scheduled_for).toBeNull();
    });

    it('al sexto intento fallido responde 429 con Retry-After, aunque la contraseña ya sea la correcta', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await requestDeletion(ana, { password: 'otra-clave-larga' }).expect(403);
      }

      const response = await requestDeletion(ana).expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(response.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      expect((await accountRow())?.deletion_scheduled_for).toBeNull();
    });

    it('dos peticiones a la vez no dejan nada a medias ni mueven la fecha', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');

      const [first, second] = await Promise.all([requestDeletion(ana), requestDeletion(ana)]);

      const accepted = [first, second].filter((response) => response.status === 202);
      expect([first.status, second.status].every((status) => [202, 401].includes(status))).toBe(
        true,
      );
      expect(accepted.length).toBeGreaterThanOrEqual(1);
      const stored = (await accountRow())?.deletion_scheduled_for?.toISOString();
      for (const response of accepted) {
        expect((response.body as { scheduledFor: string }).scheduledFor).toBe(stored);
      }
    });

    it('una cuenta suspendida también puede pedirla', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      await db.execute(sql`update identity.accounts set suspended_until = '2099-01-01T00:00:00Z'`);
      const response = await requestDeletion(ana).expect(202);
      expect(response.body).toHaveProperty('scheduledFor');
    });

    describe('moderadores', () => {
      it('el único moderador recibe 403 LAST_MODERATOR_CANNOT_DELETE y no se marca', async () => {
        const moderator = await signIn(server, db, 'mod@correo.com', 'moderador');

        const response = await requestDeletion(moderator).expect(403);

        expect(response.body).toMatchObject({ code: 'LAST_MODERATOR_CANNOT_DELETE' });
        expect((await accountRow('mod@correo.com'))?.deletion_scheduled_for).toBeNull();
        await request(server).get('/v1/auth/session').set('Cookie', moderator.cookie).expect(200);
      });

      it('con otro moderador puede eliminarse; el que queda ya no puede', async () => {
        const first = await signIn(server, db, 'mod1@correo.com', 'moderador');
        const second = await signIn(server, db, 'mod2@correo.com', 'moderador');

        await requestDeletion(first).expect(202);
        const last = await requestDeletion(second).expect(403);

        expect(last.body).toMatchObject({ code: 'LAST_MODERATOR_CANNOT_DELETE' });
      });

      it('dos moderadores a la vez: uno queda pendiente y el otro sigue siendo moderador', async () => {
        const first = await signIn(server, db, 'mod1@correo.com', 'moderador');
        const second = await signIn(server, db, 'mod2@correo.com', 'moderador');

        const results = await Promise.all([requestDeletion(first), requestDeletion(second)]);

        expect(results.map((response) => response.status).sort()).toEqual([202, 403]);
        const pending = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from identity.accounts where role = 'moderador' and deletion_scheduled_for is null`,
        );
        expect(pending.rows[0]?.n).toBe(1);
      });
    });
  });

  describe('durante los 10 días de gracia', () => {
    it('iniciar sesión con la contraseña correcta responde 403 ACCOUNT_PENDING_DELETION con la fecha y sin sesión', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      const scheduled = await requestDeletion(ana).expect(202);
      const sessionsBefore = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from identity.sessions`,
      );

      const response = await login().expect(403);

      expect(response.body).toMatchObject({
        code: 'ACCOUNT_PENDING_DELETION',
        scheduledFor: (scheduled.body as { scheduledFor: string }).scheduledFor,
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      // Ni el correo, ni el nombre, ni el hash, ni el id de la cuenta.
      expect(JSON.stringify(response.body)).not.toMatch(/ana@|Persona|argon|[0-9a-f]{8}-/);
      const sessionsAfter = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from identity.sessions`,
      );
      expect(sessionsAfter.rows[0]?.n).toBe(sessionsBefore.rows[0]?.n);
    });

    it('con una contraseña mala el error es el genérico de siempre: no revela que la cuenta existe ni que está pendiente', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      await requestDeletion(ana).expect(202);

      const pending = await login('ana@correo.com', 'otra-clave-larga').expect(401);
      const unknown = await login('nadie@correo.com', 'otra-clave-larga').expect(401);

      expect(pending.body).toEqual(unknown.body);
    });

    it('registrarse con ese correo responde igual que con cualquier correo en uso y no crea otra cuenta', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      await requestDeletion(ana).expect(202);
      const before = await accountRow();

      await request(server)
        .post('/v1/auth/register')
        .send({
          email: 'ana@correo.com',
          displayName: 'Otra Persona',
          password: 'otra-clave-larga',
          acceptedPolicyVersion: '2026-11',
        })
        .expect(201);

      const rows = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from identity.accounts`,
      );
      expect(rows.rows[0]?.n).toBe(1);
      expect(await accountRow()).toEqual(before);
    });

    it('POST /v1/auth/restore-account cancela la eliminación y deja la sesión iniciada como el login', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      await requestDeletion(ana).expect(202);

      const response = await restore('Ana@Correo.com').expect(204);

      const [setCookie] = response.headers['set-cookie'] as unknown as string[];
      expect(setCookie).toMatch(/^valora_session=[\w-]{43}; /);
      expect(setCookie).toContain('Max-Age=2592000');
      expect(setCookie).toContain('HttpOnly');
      expect(response.body).toEqual({});
      const cookie = (setCookie ?? '').split(';')[0] ?? '';
      await request(server).get('/v1/auth/session').set('Cookie', cookie).expect(200);
      expect((await accountRow())?.deletion_scheduled_for).toBeNull();
      // Restaurada, la purga ya no la toca.
      await expect(purgeAt(new Date(Date.now() + 30 * DAY))).resolves.toEqual({
        purged: 0,
        failed: 0,
      });
      expect(await accountRow()).toBeDefined();
    });

    it.each([
      ['una contraseña mala', 'ana@correo.com', 'otra-clave-larga'],
      ['un correo inexistente', 'nadie@correo.com', PASSWORD],
    ])('restaurar con %s responde el 401 genérico del login', async (_case, email, password) => {
      const ana = await signIn(server, db, 'ana@correo.com');
      await requestDeletion(ana).expect(202);

      const response = await restore(email, password).expect(401);

      expect(response.body).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Correo o contraseña incorrectos.',
      });
      expect((await accountRow())?.deletion_scheduled_for).not.toBeNull();
    });

    it('restaurar una cuenta que no está pendiente responde el mismo 401 genérico', async () => {
      await signIn(server, db, 'ana@correo.com');

      const response = await restore().expect(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('restaurar comparte el límite de intentos del login: al sexto fallo, 429', async () => {
      await signIn(server, db, 'ana@correo.com');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await restore('ana@correo.com', 'otra-clave-larga').expect(401);
      }

      const response = await restore().expect(429);
      await login().expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('purga', () => {
    it('antes de los 10 días no borra; después sí, libera el correo y conserva los reportes sin datos personales', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      // El registro dejó un enlace de verificación pendiente y el inicio de sesión, una sesión.
      const hanging = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from identity.email_verifications`,
      );
      expect(hanging.rows[0]?.n).toBe(1);
      await seedReportOf(ana.accountId);
      const response = await requestDeletion(ana).expect(202);
      const scheduledFor = new Date((response.body as { scheduledFor: string }).scheduledFor);

      await expect(purgeAt(new Date(scheduledFor.getTime() - 1))).resolves.toEqual({
        purged: 0,
        failed: 0,
      });
      expect(await accountRow()).toBeDefined();

      await expect(purgeAt(scheduledFor)).resolves.toEqual({ purged: 1, failed: 0 });

      // Todo lo que colgaba de la cuenta se fue, en la misma transacción.
      expect(await accountRow()).toBeUndefined();
      for (const table of ['identity.sessions', 'identity.email_verifications']) {
        const left = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from ${sql.raw(table)}`,
        );
        expect(left.rows[0]?.n).toBe(0);
      }
      // Idempotente: otra pasada no hace nada.
      await expect(purgeAt(new Date(scheduledFor.getTime() + DAY))).resolves.toEqual({
        purged: 0,
        failed: 0,
      });

      // El correo queda libre: se puede registrar de nuevo, y es otra cuenta (otro id, otra clave).
      const reborn = await signIn(server, db, 'ana@correo.com');
      expect(reborn.accountId).not.toBe(ana.accountId);

      // Los reportes siguen, con el identificador interno sin cuenta, y la comparación los muestra.
      const reports = await db.execute<{ reporter_id: string }>(
        sql`select reporter_id from pricing.reports`,
      );
      expect(reports.rows).toEqual([{ reporter_id: ana.accountId }]);
      const comparison = await request(server)
        .get(`/v1/products/${productId}/comparison`)
        .query({ municipality: 'armenia' })
        .expect(200);
      expect(JSON.stringify(comparison.body)).toContain('2500');
      expect(JSON.stringify(comparison.body)).not.toMatch(/ana@|reporter|account/i);
    });

    it('si el borrado de una cuenta falla, no queda a medias: la transacción se deshace', async () => {
      const ana = await signIn(server, db, 'ana@correo.com');
      const response = await requestDeletion(ana).expect(202);
      const scheduledFor = new Date((response.body as { scheduledFor: string }).scheduledFor);
      // Una restricción que obliga a fallar el DELETE de la cuenta, después de borrar sesiones.
      await db.execute(sql`
        create or replace function identity.fail_delete() returns trigger language plpgsql as
        $$ begin raise exception 'fallo simulado'; end $$;
        create trigger fail_delete_test before delete on identity.accounts
          for each row execute function identity.fail_delete();`);
      try {
        await expect(purgeAt(scheduledFor)).resolves.toEqual({ purged: 0, failed: 1 });
        const sessions = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from identity.sessions`,
        );
        // Las sesiones borradas dentro de la transacción reaparecen: nada a medias.
        expect(sessions.rows[0]?.n).toBe(1);
        expect(await accountRow()).toBeDefined();
      } finally {
        await db.execute(sql`
          drop trigger if exists fail_delete_test on identity.accounts;
          drop function if exists identity.fail_delete();`);
      }

      await expect(purgeAt(scheduledFor)).resolves.toEqual({ purged: 1, failed: 0 });
    });
  });

  // Un reporte de la cuenta, publicado y visible en la comparación (sin pasar por el outbox).
  async function seedReportOf(accountId: string): Promise<void> {
    const catalog = app.get(ImportCatalog);
    await catalog.save({
      id: productId,
      name: 'Arroz de la eliminación',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      image: {
        url: 'https://images.openfoodfacts.org/arroz.jpg',
        source: 'open_food_facts',
        attribution: 'Open Food Facts, CC BY-SA',
      },
      presentations: [
        { id: presentationId, quantity: 500, unit: 'g', packCount: 1, barcode: '7702511000099' },
      ],
    });
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda de la eliminación',
      type: 'barrio',
      address: 'Cra. 14 # 20-30',
      neighborhood: 'Centro',
      lat: 4.535,
      lng: -75.6811,
    });
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    const reportId = 'd0444444-4444-4444-8444-000000000001';
    await db.execute(
      sql`insert into pricing.reports (id, presentation_id, establishment_id, reporter_id, price_cop,
            price_type, status, observed_at, received_at, idempotency_key, request_hash)
          values (${reportId}, ${presentationId}, ${storeId}, ${accountId}, 2500, 'normal', 'vigente',
            ${observedAt}, ${observedAt}, gen_random_uuid(), 'hash-de-prueba')`,
    );
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: storeId,
      reportId,
      priceCop: 2500,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });
  }
});
