import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { ImportCatalog, ProductForComparison } from '../../src/modules/catalog';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Datos de prueba: solo existen dentro de esta prueba.
const productId = 'f1111111-1111-4111-8111-111111111111';
const missingId = 'f9999999-9999-4999-8999-999999999999';

describe('consultas públicas que usa la comparación (grill de la #15, pregunta 2)', () => {
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

  it('catalog entrega las presentaciones del producto y si su categoría es fresca, o null si no existe', async () => {
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Leche entera',
      categoryCode: 'dairy-eggs',
      presentations: [
        { id: 'f1111111-1111-4111-8111-aaaaaaaaaaaa', quantity: 1.1, unit: 'l', packCount: 1 },
        { id: 'f1111111-1111-4111-8111-bbbbbbbbbbbb', quantity: 200, unit: 'ml', packCount: 6 },
      ],
    });
    const products = app.get(ProductForComparison);

    await expect(products.find(productId)).resolves.toEqual({
      id: productId,
      isFresh: true,
      presentations: [
        { id: 'f1111111-1111-4111-8111-aaaaaaaaaaaa', quantity: 1.1, unit: 'l', packCount: 1 },
        { id: 'f1111111-1111-4111-8111-bbbbbbbbbbbb', quantity: 200, unit: 'ml', packCount: 6 },
      ],
    });
    await expect(products.find(missingId)).resolves.toBeNull();
  });
});
