import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { DrizzleProductImportRepository } from '../../src/modules/catalog/infrastructure/drizzle-product-import-repository';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

const withoutImageId = 'f3333333-3333-4333-8333-333333333331';
const withImageId = 'f3333333-3333-4333-8333-333333333332';

const OFF = {
  url: 'https://images.openfoodfacts.org/arroz.jpg',
  source: 'open_food_facts' as const,
  attribution: 'Open Food Facts, CC BY-SA',
};

describe('imágenes de productos en el repositorio de importación (ADR-022)', () => {
  let app: INestApplication;
  let db: Database;
  let repository: DrizzleProductImportRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
    repository = new DrizzleProductImportRepository(db);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate catalog.presentations, catalog.products cascade`);
    const base = { categoryCode: 'grains-groceries', presentations: [] };
    await repository.save({ id: withoutImageId, name: 'Sin foto', ...base });
    await repository.save({ id: withImageId, name: 'Con foto', image: OFF, ...base });
  });

  it('imageUrlOf devuelve null sin imagen o sin producto, y la URL si hay', async () => {
    expect(await repository.imageUrlOf(withoutImageId)).toBeNull();
    expect(await repository.imageUrlOf('f3333333-3333-4333-8333-333333333399')).toBeNull();
    expect(await repository.imageUrlOf(withImageId)).toBe(OFF.url);
  });

  it('listImages devuelve solo los productos con imagen, con fuente y atribución', async () => {
    expect(await repository.listImages()).toEqual([{ id: withImageId, image: OFF }]);
  });

  it('setImage reemplaza la dirección y conserva fuente y atribución', async () => {
    const mirrored = {
      ...OFF,
      url: 'https://abc.supabase.co/storage/v1/object/public/productos/products/a.webp',
    };

    await repository.setImage(withImageId, mirrored);
    await repository.setImage(withoutImageId, mirrored);

    expect(await repository.imageUrlOf(withImageId)).toBe(mirrored.url);
    expect(await repository.listImages()).toEqual([
      { id: withoutImageId, image: mirrored },
      { id: withImageId, image: mirrored },
    ]);
  });
});
