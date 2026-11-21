import { OpenFoodFactsImages } from './open-food-facts';

const PHOTO = 'https://images.openfoodfacts.org/images/products/770/200/102/3456/front_es.jpg';

// fetch simulado: responde siempre lo mismo y anota cada pedido.
function fakeFetch(reply: () => Promise<Response>) {
  const requests: { url: string; headers: Headers }[] = [];
  const fetcher: typeof fetch = (url, init) => {
    requests.push({
      url: url instanceof Request ? url.url : url.toString(),
      headers: new Headers(init?.headers),
    });
    return reply();
  };
  return { fetcher, requests };
}

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const images = (fetcher: typeof fetch) => new OpenFoodFactsImages(fetcher, () => Promise.resolve());

describe('Open Food Facts por código de barras (ADR-020, #119)', () => {
  it('pide solo la foto frontal del código, con un User-Agent del proyecto y sin datos personales', async () => {
    const { fetcher, requests } = fakeFetch(() =>
      json(200, { status: 1, product: { image_front_url: PHOTO } }),
    );

    await expect(images(fetcher).find('7702001023456')).resolves.toEqual({
      status: 'found',
      url: PHOTO,
    });

    expect(requests.map(({ url }) => url)).toEqual([
      'https://world.openfoodfacts.org/api/v2/product/7702001023456?fields=image_front_url',
    ]);
    const agent = requests[0]?.headers.get('user-agent') ?? '';
    expect(agent).toMatch(/^Valora\//);
    expect(agent).not.toMatch(/@/);
  });

  it('un producto sin foto frontal, o con un enlace que no es https, no trae foto', async () => {
    const withoutPhoto = fakeFetch(() => json(200, { status: 1, product: {} }));
    const plainHttp = fakeFetch(() =>
      json(200, {
        status: 1,
        product: { image_front_url: 'http://images.openfoodfacts.org/a.jpg' },
      }),
    );

    await expect(images(withoutPhoto.fetcher).find('1')).resolves.toEqual({ status: 'no_image' });
    await expect(images(plainHttp.fetcher).find('1')).resolves.toEqual({ status: 'no_image' });
  });

  it('un código que Open Food Facts no conoce es «no está»', async () => {
    const { fetcher } = fakeFetch(() =>
      json(404, { status: 0, status_verbose: 'product not found' }),
    );

    await expect(images(fetcher).find('7702001000002')).resolves.toEqual({ status: 'not_found' });
  });

  it('también es «no está» si responde 200 con status 0', async () => {
    const { fetcher } = fakeFetch(() =>
      json(200, { status: 0, status_verbose: 'product not found' }),
    );

    await expect(images(fetcher).find('7702001000002')).resolves.toEqual({ status: 'not_found' });
  });

  it('un error de red o del servidor se informa sin detener el script', async () => {
    const offline = fakeFetch(() => Promise.reject(new Error('getaddrinfo ENOTFOUND')));
    const failing = fakeFetch(() => json(503, {}));

    await expect(images(offline.fetcher).find('1')).resolves.toEqual({
      status: 'error',
      message: 'getaddrinfo ENOTFOUND',
    });
    await expect(images(failing.fetcher).find('1')).resolves.toEqual({
      status: 'error',
      message: 'HTTP 503',
    });
  });

  it('espera entre una consulta y otra para respetar el límite de Open Food Facts', async () => {
    const { fetcher } = fakeFetch(() => json(200, { status: 1, product: {} }));
    const pauses: number[] = [];
    const off = new OpenFoodFactsImages(fetcher, (ms) => {
      pauses.push(ms);
      return Promise.resolve();
    });

    await off.find('1');
    await off.find('2');
    await off.find('3');

    expect(pauses).toEqual([700, 700]);
  });

  // #195: el 21-nov-2026 Open Food Facts frenó la semilla con 429 y se quedaron ~50 productos sin
  // consultar. Frenado no es «no está»: se espera y se vuelve a pedir el mismo código.
  it('si Open Food Facts frena las consultas (HTTP 429), espera y reintenta el mismo código', async () => {
    const replies = [
      () => json(429, {}),
      () => json(429, {}),
      () => json(200, { status: 1, product: { image_front_url: PHOTO } }),
    ];
    let call = 0;
    const { fetcher, requests } = fakeFetch(() => (replies[call++] ?? replies[2])!());
    const waits: number[] = [];
    const patient = new OpenFoodFactsImages(fetcher, (ms) => {
      waits.push(ms);
      return Promise.resolve();
    });

    await expect(patient.find('7702001023456')).resolves.toEqual({ status: 'found', url: PHOTO });

    expect(requests).toHaveLength(3);
    expect(new Set(requests.map(({ url }) => url)).size).toBe(1);
    expect(waits).toHaveLength(2);
    expect(waits.every((ms) => ms > 0)).toBe(true);
  });
});
