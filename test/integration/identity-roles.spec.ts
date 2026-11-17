import { Controller, Get, type INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { IdentityModule, Roles, SessionGuard } from '../../src/modules/identity';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { signIn } from '../support/sign-in';

// Ruta que solo existe en esta prueba (grill de la #16, pregunta 5): solo un reportante pasa.
@Controller('test-roles')
class RolesTestController {
  @Get('reportante')
  @UseGuards(SessionGuard)
  @Roles('reportante')
  onlyReporters(): { ok: true } {
    return { ok: true };
  }
}

describe('acceso por rol (RF-002)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // IdentityModule exporta el guard a quien lo importa, como hará pricing.
      imports: [AppModule, IdentityModule],
      controllers: [RolesTestController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
  });

  const cookieFor = async (email: string, role: string): Promise<string> =>
    (await signIn(server, db, email, role)).cookie;

  it('un reportante pasa', async () => {
    const cookie = await cookieFor('ana@correo.com', 'reportante');

    const response = await request(server)
      .get('/v1/test-roles/reportante')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  it.each(['comercio', 'moderador'])('un %s recibe 403 FORBIDDEN', async (role) => {
    const cookie = await cookieFor(`${role}@correo.com`, role);

    const response = await request(server)
      .get('/v1/test-roles/reportante')
      .set('Cookie', cookie)
      .expect(403);

    expect(response.body).toEqual({ code: 'FORBIDDEN', message: 'El rol no tiene permiso.' });
  });

  it('sin sesión responde 401', async () => {
    const response = await request(server).get('/v1/test-roles/reportante').expect(401);

    expect(response.body).toEqual({ code: 'UNAUTHORIZED', message: 'Se requiere sesión.' });
  });
});
