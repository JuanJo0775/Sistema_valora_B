import sharp from 'sharp';
import { type ImageProcessor, InvalidImageError } from '../application/product-image';

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_SIDE_PX = 800;

// ADR-020: reduce, convierte a WebP y descarta todos los metadatos (sharp no los copia si no se
// le pide), incluida la ubicación del teléfono.
export class SharpImageProcessor implements ImageProcessor {
  async toWebp(photo: Buffer): Promise<Buffer> {
    let format: string | undefined;
    try {
      ({ format } = await sharp(photo).metadata());
    } catch {
      throw new InvalidImageError();
    }
    if (!format || !ACCEPTED_FORMATS.has(format)) throw new InvalidImageError();
    return sharp(photo)
      .rotate()
      .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: 'inside', withoutEnlargement: true })
      .webp()
      .toBuffer();
  }
}
