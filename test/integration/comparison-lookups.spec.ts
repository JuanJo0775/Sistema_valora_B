import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import {
  ImportCatalog,
  PresentationFreshness,
  ProductForComparison,
} from '../../src/modules/catalog';
import {
  EstablishmentsAround,
  EstablishmentsWithinRadius,
  ImportEstablishments,
} from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Datos de prueba: solo existen dentro de esta prueba.
const productId = 'f1111111-1111-4111-8111-111111111111';
const missingId = 'f9999999-9999-4999-8999-999999999999';
const nearId = 'f2222222-2222-4222-8222-111111111111';
const otherId = 'f2222222-2222-4222-8222-222222222222';
const farId = 'f2222222-2222-4222-8222-333333333333';

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

  it('establishments entrega solo las tiendas pedidas que están dentro del radio, con su distancia', async () => {
    const stores = app.get(ImportEstablishments);
    // A unos 120 m del punto consultado, en la lista.
    await stores.save({ id: nearId, name: 'Cerca', type: 'barrio', lat: 4.535, lng: -75.6811 });
    // Cerca, pero no está en la lista: no tiene precio para el producto.
    await stores.save({
      id: otherId,
      name: 'Otra',
      type: 'minimercado',
      lat: 4.5345,
      lng: -75.6811,
    });
    // En la lista, pero a unos 2,9 km: fuera del radio de 1 km.
    await stores.save({ id: farId, name: 'Lejos', type: 'supermercado', lat: 4.56, lng: -75.6811 });
    const withinRadius = app.get(EstablishmentsWithinRadius);
    const point = { lat: 4.5339, lng: -75.6811, radiusMeters: 1000 };

    await expect(withinRadius.find({ ids: [nearId, farId], ...point })).resolves.toEqual([
      {
        id: nearId,
        name: 'Cerca',
        type: 'barrio',
        lat: 4.535,
        lng: -75.6811,
        distanceM: expect.closeTo(122, -1) as unknown,
      },
    ]);
    await expect(withinRadius.find({ ids: [], ...point })).resolves.toEqual([]);
  });

  // Grill de la #31, pregunta 7: la zona de referencia de reliability.
  it('establishments entrega las tiendas a 1 km o menos de una tienda, incluida ella misma', async () => {
    const stores = app.get(ImportEstablishments);
    await stores.save({ id: nearId, name: 'Centro', type: 'barrio', lat: 4.5339, lng: -75.6811 });
    // Unos 700 m al norte.
    await stores.save({ id: otherId, name: 'Vecina', type: 'barrio', lat: 4.5402, lng: -75.6811 });
    // Unos 2,9 km al norte.
    await stores.save({ id: farId, name: 'Lejana', type: 'barrio', lat: 4.56, lng: -75.6811 });

    const around = await app
      .get(EstablishmentsAround)
      .find({ establishmentId: nearId, radiusMeters: 1000 });

    expect([...around].sort()).toEqual([nearId, otherId].sort());
  });

  // Grill de la #31: reliability necesita el TTL de la categoría de cada presentación.
  it('catalog dice si una presentación es de una categoría fresca, o null si no existe', async () => {
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Leche entera',
      categoryCode: 'dairy-eggs',
      presentations: [
        { id: 'f1111111-1111-4111-8111-aaaaaaaaaaaa', quantity: 1.1, unit: 'l', packCount: 1 },
      ],
    });
    const freshness = app.get(PresentationFreshness);

    await expect(freshness.isFresh('f1111111-1111-4111-8111-aaaaaaaaaaaa')).resolves.toBe(true);
    await expect(freshness.isFresh(missingId)).resolves.toBeNull();
  });
});
