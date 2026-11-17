import type { ImageStorage } from '../application/product-image';

export interface SupabaseImageStorageOptions {
  // Dirección del proyecto: https://<id>.supabase.co
  url: string;
  // Bucket público donde viven las fotos.
  bucket: string;
  // Clave secreta del servidor (sb_secret_...): salta RLS, nunca sale de la API ni va a Git (RN2).
  secretKey: string;
  // Se inyecta en las pruebas; en producción es el fetch de Node.
  fetch?: typeof fetch;
}

// ADR-022: las fotos que sube el moderador van a un bucket público de Supabase Storage. El disco de
// Render es efímero: se borra en cada despliegue, reinicio o suspensión. La subida usa la API REST de
// Storage, sin dependencias nuevas.
export class SupabaseImageStorage implements ImageStorage {
  private readonly baseUrl: string;
  private readonly bucket: string;
  private readonly secretKey: string;
  private readonly http: typeof fetch;

  constructor(options: SupabaseImageStorageOptions) {
    // Sin las barras del final. Un ciclo y no una expresión regular (SonarQube typescript:S8786).
    let url = options.url;
    while (url.endsWith('/')) url = url.slice(0, -1);
    this.baseUrl = url;
    this.bucket = options.bucket;
    this.secretKey = options.secretKey;
    this.http = options.fetch ?? fetch;
  }

  async save(name: string, content: Buffer): Promise<string> {
    const path = this.safePath(name);
    const response = await this.http(`${this.baseUrl}/storage/v1/object/${this.bucket}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        apikey: this.secretKey,
        'Content-Type': 'image/webp',
        // El nombre lleva el hash del contenido: una foto distinta nunca reutiliza la dirección.
        'Cache-Control': 'max-age=31536000',
        // Reintentar la misma subida no falla: el contenido es el mismo.
        'x-upsert': 'true',
      },
      body: new Uint8Array(content),
    });
    if (!response.ok) {
      // Solo el estado: el cuerpo de la respuesta y la clave no se copian al mensaje.
      throw new Error(`Supabase Storage rechazó la subida (HTTP ${String(response.status)}).`);
    }
    return `${this.baseUrl}/storage/v1/object/public/${this.bucket}/${path}`;
  }

  // Misma regla que LocalImageStorage: nada fuera del bucket. Se revisa cada segmento, sin depender
  // del separador del sistema operativo.
  private safePath(name: string): string {
    const segments = name.split('/');
    const invalid = segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..' || segment.includes('\\'),
    );
    if (invalid) throw new Error('Nombre de archivo inválido.');
    return segments.map(encodeURIComponent).join('/');
  }
}
