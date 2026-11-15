import { createHash } from 'node:crypto';
import type { ImageProcessor, ImageStorage } from './product-image';
import type { ProductImage } from './product-repository';

export interface SetProductImagePorts {
  products: { exists(productId: string): Promise<boolean> };
  processor: ImageProcessor;
  storage: ImageStorage;
  images: { setImage(productId: string, image: ProductImage): Promise<void> };
}

// ADR-020: en el Corte 2 las fotos subidas son del equipo.
export const TEAM_ATTRIBUTION = 'Equipo Valora';

// ADR-020 (#88): el moderador sube la foto de un producto; reemplaza la imagen que tenía.
export class SetProductImage {
  constructor(private readonly ports: SetProductImagePorts) {}

  async execute(productId: string, photo: Buffer): Promise<ProductImage | null> {
    const { products, processor, storage, images } = this.ports;
    if (!(await products.exists(productId))) return null;
    const webp = await processor.toWebp(photo);
    // El nombre cambia si cambia la foto: así se puede guardar en caché por mucho tiempo.
    const hash = createHash('sha256').update(webp).digest('hex').slice(0, 12);
    const url = await storage.save(`products/${productId}-${hash}.webp`, webp);
    const image: ProductImage = { url, source: 'equipo', attribution: TEAM_ATTRIBUTION };
    await images.setImage(productId, image);
    return image;
  }
}
