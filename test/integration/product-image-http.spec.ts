import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

// Producto de prueba: solo existe dentro de esta prueba.
const productId = 'ee111111-1111-4111-8111-111111111111';
const path = `/v1/moderation/products/${productId}/image`;

describe('PUT /v1/moderation/products/{productId}/image (ADR-020, #88)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let reporter: SignedIn;
  let moderator: SignedIn;
  let photo: Buffer;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
    reporter = await signIn(server, db, 'reportante-fotos@correo.com');
    moderator = await signIn(server, db, 'moderador-fotos@correo.com', 'moderador');
    // Una foto de teléfono: grande y con metadatos.
    photo = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: '#e67e22' },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: 'Teléfono de quien tomó la foto' } })
      .toBuffer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate catalog.presentations, catalog.products`);
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz con foto',
      categoryCode: 'grains-groceries',
      presentations: [
        { id: 'ee111111-1111-4111-8111-aaaaaaaaaaaa', quantity: 500, unit: 'g', packCount: 1 },
      ],
    });
  });

  const upload = (as: SignedIn | null, file: Buffer | null, target = path) => {
    let call = request(server).put(target);
    if (as) call = call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken);
    return file
      ? call.attach('file', file, { filename: 'foto.jpg', contentType: 'image/jpeg' })
      : call.field('nada', 'sin archivo');
  };

  it('200: la foto queda como imagen del producto, en WebP de 800 px y sin metadatos', async () => {
    const response = await upload(moderator, photo).expect(200);

    const image = response.body as { url: string; source: string; attribution: string };
    expect(image).toEqual({
      url: expect.stringMatching(
        /\/media\/products\/ee111111-[0-9a-f-]+-[0-9a-f]{12}\.webp$/,
      ) as unknown,
      source: 'equipo',
      attribution: 'Equipo Valora',
    });
    const product = await request(server).get(`/v1/products/${productId}`).expect(200);
    expect((product.body as { image: unknown }).image).toEqual(image);

    const file = await request(server)
      .get(new URL(image.url).pathname)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(file.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const metadata = await sharp(file.body as Buffer).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 800, height: 600 });
    expect(metadata.exif).toBeUndefined();
  });

  it('400 sin archivo o si no es imagen; 413 con más de 2 MB; 404 si el producto no existe', async () => {
    const responses = await Promise.all([
      upload(moderator, null),
      upload(moderator, Buffer.from('no soy una imagen')),
      upload(moderator, Buffer.alloc(2 * 1024 * 1024 + 1, 1)),
      upload(
        moderator,
        photo,
        '/v1/moderation/products/ee999999-9999-4999-8999-999999999999/image',
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 413, 404]);
    expect(responses[2].body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('401 sin sesión; 403 un reportante o sin CSRF', async () => {
    const withoutCsrf = request(server)
      .put(path)
      .set('Cookie', moderator.cookie)
      .attach('file', photo, { filename: 'foto.jpg', contentType: 'image/jpeg' });

    const responses = await Promise.all([
      upload(null, photo),
      upload(reporter, photo),
      withoutCsrf,
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 403, 403]);
  });
});
