import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

describe('conexión a PostgreSQL + PostGIS con Drizzle', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('la base de pruebas migrada tiene PostGIS disponible', async () => {
    const db = app.get<Database>(DATABASE);

    const result = await db.execute<{ version: string }>(
      sql`select postgis_lib_version() as version`,
    );

    expect(result.rows[0]?.version).toMatch(/^3\./);
  });
});
