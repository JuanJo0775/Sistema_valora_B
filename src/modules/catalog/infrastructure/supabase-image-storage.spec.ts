import { SupabaseImageStorage } from './supabase-image-storage';

// ADR-022: las fotos del moderador van a un bucket público de Supabase Storage, no al disco
// efímero de Render. Estas pruebas usan un doble de fetch: no llaman a Supabase.
interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(status = 200): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init: init ?? {} });
    return Promise.resolve(new Response('{}', { status }));
  };
  return { fetch: fake, calls };
}

const options = {
  url: 'https://abc123.supabase.co/',
  bucket: 'productos',
  secretKey: 'clave-de-prueba',
};

describe('guardar fotos en Supabase Storage (ADR-022)', () => {
  it('sube el archivo al bucket y devuelve su dirección pública estable', async () => {
    const { fetch: doble, calls } = fakeFetch();
    const storage = new SupabaseImageStorage({ ...options, fetch: doble });

    const url = await storage.save('products/arroz-abc123.webp', Buffer.from('foto'));

    expect(url).toBe(
      'https://abc123.supabase.co/storage/v1/object/public/productos/products/arroz-abc123.webp',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://abc123.supabase.co/storage/v1/object/productos/products/arroz-abc123.webp',
    );
    expect(calls[0]?.init.method).toBe('POST');
  });

  it('envía la clave secreta solo en las cabeceras, el tipo WebP y caché de un año', async () => {
    const { fetch: doble, calls } = fakeFetch();
    const storage = new SupabaseImageStorage({ ...options, fetch: doble });

    await storage.save('products/a.webp', Buffer.from('foto'));

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('authorization')).toBe('Bearer clave-de-prueba');
    expect(headers.get('content-type')).toBe('image/webp');
    expect(headers.get('cache-control')).toBe('max-age=31536000');
    expect(calls[0]?.url).not.toContain('clave-de-prueba');
  });

  it('un nombre que intenta salir del bucket se rechaza sin llamar a Supabase', async () => {
    const { fetch: doble, calls } = fakeFetch();
    const storage = new SupabaseImageStorage({ ...options, fetch: doble });

    await expect(storage.save('../otro/a.webp', Buffer.from('x'))).rejects.toThrow(
      'Nombre de archivo inválido',
    );
    await expect(storage.save('/absoluto.webp', Buffer.from('x'))).rejects.toThrow(
      'Nombre de archivo inválido',
    );
    expect(calls).toHaveLength(0);
  });

  it('si Supabase rechaza la subida falla con el estado y sin revelar la clave', async () => {
    const { fetch: doble } = fakeFetch(403);
    const storage = new SupabaseImageStorage({ ...options, fetch: doble });

    const error = await storage.save('products/a.webp', Buffer.from('x')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('403');
    expect((error as Error).message).not.toContain('clave-de-prueba');
  });
});
