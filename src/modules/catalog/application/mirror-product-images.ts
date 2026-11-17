import { createHash } from 'node:crypto';
import type { ImageDownloader, ImageProcessor, ImageStorage } from './product-image';
import type { ProductImage } from './product-repository';

export interface MirrorPorts {
  images: {
    listImages(): Promise<{ id: string; image: ProductImage }[]>;
    setImage(productId: string, image: ProductImage): Promise<void>;
  };
  downloader: ImageDownloader;
  processor: ImageProcessor;
  storage: ImageStorage;
  // Dirección del proyecto de Supabase (SUPABASE_URL): su host dice qué fotos ya están copiadas.
  supabaseUrl: string;
  // Espera entre una descarga y la siguiente (cortesía con Open Food Facts).
  pause?: (ms: number) => Promise<void>;
  delayMs?: number;
}

export interface MirrorReport {
  copied: number;
  alreadyThere: number;
  failed: number;
  // Una entrada por foto fallida, sin direcciones ni claves.
  failures: { productId: string; reason: string }[];
}

// ¿La dirección es del proyecto de Supabase? Se compara el host exacto.
export function isSupabaseImageUrl(imageUrl: string, supabaseUrl: string): boolean {
  try {
    return new URL(imageUrl).host === new URL(supabaseUrl).host;
  } catch {
    return false;
  }
}

// ADR-022 (actualización): copia al bucket de Supabase las fotos que siguen en un sitio externo.
// Es idempotente (las que ya están en Supabase no se tocan) y conserva fuente y atribución: Open Food
// Facts exige CC BY-SA. Si algo falla la URL original se queda, así la foto que ya sirve no se rompe.
export class MirrorProductImages {
  constructor(private readonly ports: MirrorPorts) {}

  async execute(): Promise<MirrorReport> {
    const { images, downloader, processor, storage, supabaseUrl } = this.ports;
    const pause = this.ports.pause ?? ((ms) => new Promise<void>((done) => setTimeout(done, ms)));
    const delayMs = this.ports.delayMs ?? 500;
    const report: MirrorReport = { copied: 0, alreadyThere: 0, failed: 0, failures: [] };
    let downloaded = false;
    for (const { id, image } of await images.listImages()) {
      if (isSupabaseImageUrl(image.url, supabaseUrl)) {
        report.alreadyThere++;
        continue;
      }
      try {
        if (downloaded) await pause(delayMs);
        downloaded = true;
        const webp = await processor.toWebp(await downloader.download(image.url));
        // Mismo nombre que el moderador (set-product-image.ts): el hash del contenido.
        const hash = createHash('sha256').update(webp).digest('hex').slice(0, 12);
        const url = await storage.save(`products/${id}-${hash}.webp`, webp);
        await images.setImage(id, { url, source: image.source, attribution: image.attribution });
        report.copied++;
      } catch (error) {
        report.failed++;
        report.failures.push({
          productId: id,
          reason: error instanceof Error ? error.message : 'Error desconocido.',
        });
      }
    }
    return report;
  }
}

export function mirrorSummary(report: MirrorReport): string[] {
  return [
    `Fotos copiadas a Supabase: ${String(report.copied)}.`,
    `Ya estaban en Supabase: ${String(report.alreadyThere)}.`,
    `Fallidas (se conserva la URL original): ${String(report.failed)}.`,
    ...report.failures.map((f) => `  - producto ${f.productId}: ${f.reason}`),
  ];
}
