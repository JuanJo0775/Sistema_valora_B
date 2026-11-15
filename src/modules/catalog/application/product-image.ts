// ADR-020 (#88): puertos para la foto de un producto que sube el moderador.

// Deja la foto en WebP de 800 px como máximo y sin metadatos (EC-08).
export interface ImageProcessor {
  toWebp(photo: Buffer): Promise<Buffer>;
}

// Guarda el archivo y devuelve su dirección pública. Hoy, una carpeta del servidor; el proveedor
// llega con ADR-012.
export interface ImageStorage {
  save(name: string, content: Buffer): Promise<string>;
}

// El archivo no es una imagen JPEG, PNG o WebP: la capa HTTP lo traduce a 400.
export class InvalidImageError extends Error {
  constructor() {
    super('El archivo debe ser una imagen JPEG, PNG o WebP.');
    this.name = 'InvalidImageError';
  }
}
