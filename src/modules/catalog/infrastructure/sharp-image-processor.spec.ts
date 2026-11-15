import sharp from 'sharp';
import { InvalidImageError } from '../application/product-image';
import { SharpImageProcessor } from './sharp-image-processor';

// ADR-020 (#88): la foto se guarda en WebP de 800 px como máximo y sin metadatos (EC-08).
describe('procesar la foto de un producto (ADR-020)', () => {
  const processor = new SharpImageProcessor();

  it('un JPEG grande con metadatos sale en WebP de 800 px como máximo y sin metadatos', async () => {
    const photo = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: '#c0392b' },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: 'Teléfono de quien tomó la foto', Copyright: 'Calle 20' } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();

    const result = await processor.toWebp(photo);

    const metadata = await sharp(result).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 800, height: 400 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it('una foto pequeña no se agranda', async () => {
    const photo = await sharp({
      create: { width: 300, height: 600, channels: 3, background: '#2980b9' },
    })
      .png()
      .toBuffer();

    const metadata = await sharp(await processor.toWebp(photo)).metadata();

    expect(metadata).toMatchObject({ format: 'webp', width: 300, height: 600 });
  });

  it('un archivo que no es JPEG, PNG ni WebP se rechaza', async () => {
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#000000' },
    })
      .gif()
      .toBuffer();

    await expect(processor.toWebp(Buffer.from('no soy una imagen'))).rejects.toThrow(
      InvalidImageError,
    );
    await expect(processor.toWebp(gif)).rejects.toThrow(InvalidImageError);
  });
});
