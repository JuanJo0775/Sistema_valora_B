import type { ImageResult } from '../application/product-images';

// Un nombre genérico del proyecto, sin correo ni datos personales (#119).
const USER_AGENT = 'Valora/0.1 (proyecto universitario, semilla del catálogo)';
// Open Food Facts pide no pasar de 100 consultas de producto por minuto.
const PAUSE_MS = 700;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

interface ProductResponse {
  product?: { image_front_url?: unknown };
}

const isHttps = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

// ADR-020: la foto frontal de un producto en la API pública de Open Food Facts. Solo trae el
// enlace; la foto nunca se descarga.
export class OpenFoodFactsImages {
  private asked = false;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  async find(barcode: string): Promise<ImageResult> {
    if (this.asked) await this.wait(PAUSE_MS);
    this.asked = true;
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=image_front_url`;
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok) return { status: 'error', message: `HTTP ${String(response.status)}` };
    const body = (await response.json()) as ProductResponse;
    const photo = body.product?.image_front_url;
    return isHttps(photo) ? { status: 'found', url: photo } : { status: 'no_image' };
  }
}
