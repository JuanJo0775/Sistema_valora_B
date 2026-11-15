import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalImageStorage } from './local-image-storage';

// ADR-020 (#88): mientras no se decida ADR-012, las fotos van a una carpeta del servidor.
describe('guardar fotos en una carpeta del servidor (ADR-020)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'valora-media-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('guarda el archivo, creando la subcarpeta, y devuelve su dirección pública', async () => {
    const storage = new LocalImageStorage(dir, 'http://localhost:3000/media/');

    const url = await storage.save('products/arroz-abc123.webp', Buffer.from('foto'));

    expect(url).toBe('http://localhost:3000/media/products/arroz-abc123.webp');
    await expect(readFile(join(dir, 'products', 'arroz-abc123.webp'), 'utf8')).resolves.toBe(
      'foto',
    );
  });

  it('un nombre que intenta salir de la carpeta se rechaza', async () => {
    const storage = new LocalImageStorage(dir, 'http://localhost:3000/media');

    await expect(storage.save('../fuera.webp', Buffer.from('foto'))).rejects.toThrow(
      'Nombre de archivo inválido',
    );
  });
});
