import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { ImportCatalog, PresentationExists } from '../../src/modules/catalog';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Datos de prueba: solo existen dentro de esta prueba.
const presentationId = 'e1111111-1111-4111-8111-aaaaaaaaaaaa';
const missingId = 'e9999999-9999-4999-8999-999999999999';

describe('comprobar por la interfaz pública que algo existe (grill de la #14, pregunta 5)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate catalog.presentations, catalog.products, establishments.establishments`,
    );
  });

  it('catalog dice si una presentación existe', async () => {
    await app.get(ImportCatalog).save({
      id: 'e1111111-1111-4111-8111-111111111111',
      name: 'Producto de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    const presentations = app.get(PresentationExists);

    await expect(presentations.exists(presentationId)).resolves.toBe(true);
    await expect(presentations.exists(missingId)).resolves.toBe(false);
  });
});
