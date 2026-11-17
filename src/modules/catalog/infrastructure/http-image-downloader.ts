import { type ImageDownloader, ImageDownloadError } from '../application/product-image';

export interface HttpImageDownloaderOptions {
  timeoutMs?: number;
  maxBytes?: number;
  // Intentos en total (el primero más los reintentos).
  attempts?: number;
  // Espera base entre intentos; crece con cada uno. Se respeta Retry-After hasta maxWaitMs.
  retryDelayMs?: number;
  maxWaitMs?: number;
  // Se inyectan en las pruebas.
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([429, 503]);
const FAILED = 'La descarga falló o superó el tiempo límite.';
const TOO_BIG = 'La imagen pesa más del máximo permitido.';

// ADR-022 (actualización): baja la foto original de Open Food Facts con tiempo límite (15 s), peso
// máximo (5 MB), solo image/* y reintentos con espera cuando el sitio limita el ritmo (HTTP 429).
export class HttpImageDownloader implements ImageDownloader {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly attempts: number;
  private readonly retryDelayMs: number;
  private readonly maxWaitMs: number;
  private readonly http: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpImageDownloaderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    this.attempts = options.attempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 2_000;
    this.maxWaitMs = options.maxWaitMs ?? 30_000;
    this.http = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async download(url: string): Promise<Buffer> {
    for (let attempt = 1; ; attempt++) {
      const response = await this.request(url);
      if (response.ok) return this.readImage(response);
      await response.body?.cancel();
      if (!RETRYABLE.has(response.status) || attempt >= this.attempts) {
        throw new ImageDownloadError(`La descarga respondió HTTP ${String(response.status)}.`);
      }
      await this.sleep(this.waitBefore(response, attempt));
    }
  }

  private async request(url: string): Promise<Response> {
    try {
      return await this.http(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new ImageDownloadError(FAILED);
    }
  }

  private waitBefore(response: Response, attempt: number): number {
    const seconds = Number(response.headers.get('retry-after'));
    const wanted =
      Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : this.retryDelayMs * attempt;
    return Math.min(wanted, this.maxWaitMs);
  }

  private async readImage(response: Response): Promise<Buffer> {
    const type = response.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('image/')) {
      await response.body?.cancel();
      throw new ImageDownloadError('La respuesta no es una imagen.');
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > this.maxBytes) {
      await response.body?.cancel();
      throw new ImageDownloadError(TOO_BIG);
    }
    if (!response.body) throw new ImageDownloadError('La respuesta no trae contenido.');
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength;
        if (total > this.maxBytes) throw new ImageDownloadError(TOO_BIG);
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof ImageDownloadError) throw error;
      throw new ImageDownloadError(FAILED);
    }
    return Buffer.concat(chunks);
  }
}
