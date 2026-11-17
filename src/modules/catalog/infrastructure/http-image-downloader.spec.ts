import { HttpImageDownloader } from './http-image-downloader';

const URL_OFF = 'https://images.openfoodfacts.org/a.jpg';
const image = (body = 'foto', headers: Record<string, string> = {}): Response =>
  new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg', ...headers } });

function downloader(responses: (Response | Error)[], extra: { maxBytes?: number } = {}) {
  const waits: number[] = [];
  let calls = 0;
  const fetchDouble = jest.fn((): Promise<Response> => {
    const next = responses[calls++] ?? new Response('', { status: 500 });
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const instance = new HttpImageDownloader({
    fetch: fetchDouble as unknown as typeof fetch,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    ...extra,
  });
  return { instance, waits, fetchDouble };
}

describe('descarga de la foto original (ADR-022)', () => {
  it('baja la imagen', async () => {
    const { instance } = downloader([image('contenido')]);

    expect((await instance.download(URL_OFF)).toString()).toBe('contenido');
  });

  it('pide la foto con un tiempo límite', async () => {
    const { instance, fetchDouble } = downloader([image()]);

    await instance.download(URL_OFF);

    const init = (fetchDouble.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('con HTTP 429 espera y reintenta (respeta Retry-After)', async () => {
    const { instance, waits, fetchDouble } = downloader([
      new Response('', { status: 429, headers: { 'retry-after': '3' } }),
      new Response('', { status: 429 }),
      image('ok'),
    ]);

    expect((await instance.download(URL_OFF)).toString()).toBe('ok');
    expect(fetchDouble).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([3000, 4000]);
  });

  it('se rinde tras 3 intentos con 429', async () => {
    const { instance, fetchDouble } = downloader([
      new Response('', { status: 429 }),
      new Response('', { status: 429 }),
      new Response('', { status: 429 }),
      image(),
    ]);

    await expect(instance.download(URL_OFF)).rejects.toThrow('HTTP 429');
    expect(fetchDouble).toHaveBeenCalledTimes(3);
  });

  it('no reintenta un 404', async () => {
    const { instance, fetchDouble } = downloader([new Response('', { status: 404 }), image()]);

    await expect(instance.download(URL_OFF)).rejects.toThrow('HTTP 404');
    expect(fetchDouble).toHaveBeenCalledTimes(1);
  });

  it('rechaza lo que no es image/*', async () => {
    const { instance } = downloader([
      new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    ]);

    await expect(instance.download(URL_OFF)).rejects.toThrow('no es una imagen');
  });

  it('rechaza una imagen que declara más de 5 MB', async () => {
    const { instance } = downloader([image('x', { 'content-length': String(6 * 1024 * 1024) })]);

    await expect(instance.download(URL_OFF)).rejects.toThrow('más del máximo');
  });

  it('rechaza una imagen que supera el máximo aunque no lo declare', async () => {
    const { instance } = downloader([image('x'.repeat(20))], { maxBytes: 10 });

    await expect(instance.download(URL_OFF)).rejects.toThrow('más del máximo');
  });

  it('un fallo de red o de tiempo se informa sin detalles de la dirección', async () => {
    const { instance } = downloader([new Error('timeout https://secreto')]);

    await expect(instance.download(URL_OFF)).rejects.toThrow(
      'La descarga falló o superó el tiempo límite.',
    );
  });
});
