import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import type { ImageStorage } from '../application/product-image';

// ADR-020: almacenamiento provisional en una carpeta del servidor hasta decidir ADR-012. La API sirve
// esa carpeta en solo lectura en MEDIA_PUBLIC_URL.
export class LocalImageStorage implements ImageStorage {
  private readonly root: string;
  private readonly publicUrl: string;

  constructor(dir: string, publicUrl: string) {
    this.root = resolve(dir);
    this.publicUrl = publicUrl.replace(/\/+$/, '');
  }

  async save(name: string, content: Buffer): Promise<string> {
    const target = resolve(this.root, name);
    const inside = relative(this.root, target);
    if (inside === '' || inside.startsWith('..') || resolve(inside) === inside) {
      throw new Error('Nombre de archivo inválido.');
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    return `${this.publicUrl}/${inside.split('\\').join('/')}`;
  }
}
