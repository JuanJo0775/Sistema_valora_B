import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import {
  ImportCatalog,
  PresentationFreshness,
  PresentationLabels,
  PresentationsForPricing,
  ProductForComparison,
} from '../../src/modules/catalog';
import {
  EstablishmentDetails,
  EstablishmentNames,
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
        municipality: 'armenia',
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

  // Grill de la #32, pregunta 6: la cola de moderación muestra nombres, no ids.
  it('catalog y establishments dan los nombres de presentaciones y tiendas por id', async () => {
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz blanco',
      brand: 'Diana',
      categoryCode: 'grains-groceries',
      presentations: [
        { id: 'f1111111-1111-4111-8111-aaaaaaaaaaaa', quantity: 500, unit: 'g', packCount: 1 },
        { id: 'f1111111-1111-4111-8111-bbbbbbbbbbbb', quantity: 1, unit: 'kg', packCount: 6 },
      ],
    });
    await app
      .get(ImportEstablishments)
      .save({ id: nearId, name: 'Don José', type: 'barrio', lat: 4.5339, lng: -75.6811 });

    await expect(
      app
        .get(PresentationLabels)
        .of([
          'f1111111-1111-4111-8111-aaaaaaaaaaaa',
          'f1111111-1111-4111-8111-bbbbbbbbbbbb',
          missingId,
        ]),
    ).resolves.toEqual(
      new Map([
        ['f1111111-1111-4111-8111-aaaaaaaaaaaa', 'Arroz blanco Diana · 500 g'],
        ['f1111111-1111-4111-8111-bbbbbbbbbbbb', 'Arroz blanco Diana · 6 × 1 kg'],
      ]),
    );
    await expect(app.get(EstablishmentNames).of([nearId, missingId])).resolves.toEqual(
      new Map([[nearId, 'Don José']]),
    );
  });

  // Grill de la #28, pregunta 1: los precios de una tienda.
  it('establishments da el detalle de una tienda por id, o null si no existe', async () => {
    await app.get(ImportEstablishments).save({
      id: nearId,
      name: 'Don José',
      type: 'barrio',
      address: 'Cra. 14 # 20-10',
      lat: 4.535,
      lng: -75.6811,
    });

    await expect(app.get(EstablishmentDetails).find(nearId)).resolves.toEqual({
      id: nearId,
      name: 'Don José',
      type: 'barrio',
      address: 'Cra. 14 # 20-10',
      lat: 4.535,
      lng: -75.6811,
      municipality: 'armenia',
    });
    await expect(app.get(EstablishmentDetails).find(missingId)).resolves.toBeNull();
  });

  it('catalog da las presentaciones por id con su producto, su nombre y si la categoría es fresca', async () => {
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Leche entera',
      brand: 'Colanta',
      categoryCode: 'dairy-eggs',
      presentations: [
        { id: 'f1111111-1111-4111-8111-aaaaaaaaaaaa', quantity: 1.1, unit: 'l', packCount: 1 },
      ],
    });

    await expect(
      app.get(PresentationsForPricing).of(['f1111111-1111-4111-8111-aaaaaaaaaaaa', missingId]),
    ).resolves.toEqual(
      new Map([
        [
          'f1111111-1111-4111-8111-aaaaaaaaaaaa',
          {
            productId,
            label: 'Leche entera Colanta · 1.1 l',
            quantity: 1.1,
            unit: 'l',
            packCount: 1,
            isFresh: true,
          },
        ],
      ]),
    );
  });
});
