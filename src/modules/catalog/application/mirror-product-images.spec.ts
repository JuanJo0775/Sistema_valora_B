import { MirrorProductImages, type MirrorPorts, mirrorSummary } from './mirror-product-images';
import { ImageDownloadError } from './product-image';
import type { ProductImage } from './product-repository';

const SUPABASE_URL = 'https://abc.supabase.co';
const OFF: ProductImage = {
  url: 'https://images.openfoodfacts.org/images/products/1.jpg',
  source: 'open_food_facts',
  attribution: 'Open Food Facts, CC BY-SA',
};
const MIRRORED: ProductImage = {
  ...OFF,
  url: `${SUPABASE_URL}/storage/v1/object/public/productos/products/p2-abc.webp`,
};
const publicUrl = (name: string): string =>
  `${SUPABASE_URL}/storage/v1/object/public/productos/${name}`;

function setup(rows: { id: string; image: ProductImage }[], overrides: Partial<MirrorPorts> = {}) {
  const updated: { id: string; image: ProductImage }[] = [];
  const saved: string[] = [];
  const pauses: number[] = [];
  const downloads: string[] = [];
  const ports: MirrorPorts = {
    images: {
      listImages: () => Promise.resolve(rows),
      setImage: (id, image) => {
        updated.push({ id, image });
        return Promise.resolve();
      },
    },
    downloader: {
      download: (url) => {
        downloads.push(url);
        return Promise.resolve(Buffer.from('original'));
      },
    },
    processor: { toWebp: () => Promise.resolve(Buffer.from('webp')) },
    storage: {
      save: (name) => {
        saved.push(name);
        return Promise.resolve(publicUrl(name));
      },
    },
    supabaseUrl: SUPABASE_URL,
    pause: (ms) => {
      pauses.push(ms);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { mirror: new MirrorProductImages(ports), updated, saved, pauses, downloads };
}

describe('espejo de fotos en Supabase (ADR-022)', () => {
  it('copia la foto, la sube con el hash del contenido y conserva fuente y atribución', async () => {
    const { mirror, updated, saved } = setup([{ id: 'p1', image: OFF }]);

    const report = await mirror.execute();

    expect(report).toMatchObject({ copied: 1, alreadyThere: 0, failed: 0 });
    expect(saved[0]).toMatch(/^products\/p1-[0-9a-f]{12}\.webp$/);
    expect(updated).toEqual([
      {
        id: 'p1',
        image: {
          url: publicUrl(saved[0] ?? ''),
          source: 'open_food_facts',
          attribution: 'Open Food Facts, CC BY-SA',
        },
      },
    ]);
  });

  it('no toca las fotos que ya están en Supabase (idempotente)', async () => {
    const { mirror, updated, downloads } = setup([{ id: 'p2', image: MIRRORED }]);

    const report = await mirror.execute();

    expect(report).toMatchObject({ copied: 0, alreadyThere: 1, failed: 0 });
    expect(downloads).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('un host que solo se parece al de Supabase no cuenta como copiada', async () => {
    const fake: ProductImage = { ...OFF, url: 'https://abc.supabase.co.evil.example/a.jpg' };
    const { mirror } = setup([{ id: 'p3', image: fake }]);

    expect(await mirror.execute()).toMatchObject({ copied: 1, alreadyThere: 0 });
  });

  it('si la descarga falla deja la URL original y lo cuenta', async () => {
    const { mirror, updated, saved } = setup([{ id: 'p1', image: OFF }], {
      downloader: {
        download: () => Promise.reject(new ImageDownloadError('La descarga respondió HTTP 429.')),
      },
    });

    const report = await mirror.execute();

    expect(report).toMatchObject({ copied: 0, failed: 1 });
    expect(report.failures).toEqual([
      { productId: 'p1', reason: 'La descarga respondió HTTP 429.' },
    ]);
    expect(updated).toEqual([]);
    expect(saved).toEqual([]);
  });

  it('si la subida falla deja la URL original y sigue con las demás', async () => {
    let calls = 0;
    const { mirror, updated } = setup(
      [
        { id: 'p1', image: OFF },
        { id: 'p4', image: OFF },
      ],
      {
        storage: {
          save: (name) => {
            calls++;
            return calls === 1
              ? Promise.reject(new Error('Supabase Storage rechazó la subida (HTTP 500).'))
              : Promise.resolve(publicUrl(name));
          },
        },
      },
    );

    const report = await mirror.execute();

    expect(report).toMatchObject({ copied: 1, failed: 1 });
    expect(updated.map((u) => u.id)).toEqual(['p4']);
    const text = mirrorSummary(report).join('\n');
    expect(text).toContain('Fotos copiadas a Supabase: 1.');
    expect(text).toContain('Ya estaban en Supabase: 0.');
    expect(text).toContain('Fallidas (se conserva la URL original): 1.');
    expect(text).toContain('HTTP 500');
  });

  it('cuenta como fallida una imagen que el procesador rechaza', async () => {
    const { mirror, updated } = setup([{ id: 'p1', image: OFF }], {
      processor: { toWebp: () => Promise.reject(new Error('El archivo debe ser una imagen.')) },
    });

    expect(await mirror.execute()).toMatchObject({ copied: 0, failed: 1 });
    expect(updated).toEqual([]);
  });

  it('espera entre descargas, pero no antes de la primera', async () => {
    const { mirror, pauses } = setup([
      { id: 'p1', image: OFF },
      { id: 'p4', image: OFF },
      { id: 'p5', image: OFF },
    ]);

    await mirror.execute();

    expect(pauses).toEqual([500, 500]);
  });
});
