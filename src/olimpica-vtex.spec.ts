import type { OnlineObservation } from './modules/imports';
import { runOlimpicaPreview } from './olimpica-vtex';

const env = {
  OLIMPICA_VTEX_POSTAL_CODE: '630001',
  OLIMPICA_VTEX_REGION_ID: 'r1',
  OLIMPICA_VTEX_SELLER_ID: 's1',
  OLIMPICA_VTEX_EANS: '7702552000097,7702511000014,7701018007151,7702085013021,7705326468727',
};

it.each([
  {},
  { ...env, OLIMPICA_VTEX_REGION_ID: '' },
  { ...env, OLIMPICA_VTEX_SELLER_ID: '' },
  { ...env, OLIMPICA_VTEX_EANS: '7702552000097' },
])('rechaza una configuración incompleta antes de abrir el catálogo %j', async (config) => {
  const open = jest.fn();
  await expect(runOlimpicaPreview([], config, open)).rejects.toThrow('Configura una zona');
  expect(open).not.toHaveBeenCalled();
});

it('rechaza opciones desconocidas antes de abrir el catálogo', async () => {
  const open = jest.fn();
  await expect(runOlimpicaPreview(['--unknown'], env, open)).rejects.toThrow('Usa vista previa');
  expect(open).not.toHaveBeenCalled();
});

it('omite los EAN cuando VTEX no confirma la zona y cierra el catálogo', async () => {
  const close = jest.fn().mockResolvedValue(undefined);
  const request = jest.fn().mockResolvedValue(Response.json([]));
  const result = await runOlimpicaPreview(
    [],
    env,
    () => Promise.resolve({ find: () => Promise.resolve(['p1']), close }),
    request,
  );
  expect(result.rows).toHaveLength(5);
  expect(
    result.rows.every((row) => row.status === 'skipped' && row.reason === 'unverified_zone'),
  ).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it('aplica solo con la opción explícita y devuelve el identificador reutilizable', async () => {
  const runId = '7679670d-85ad-40d2-ac21-e3fb10611eba';
  const save = jest.fn();
  const close = jest.fn().mockResolvedValue(undefined);
  const request = jest.fn().mockResolvedValue(Response.json([]));
  const result = await runOlimpicaPreview(
    ['--apply', '--run-id=' + runId],
    env,
    () => Promise.resolve({ find: () => Promise.resolve(['p1']), close, save }),
    request,
  );
  expect(result).toMatchObject({ mode: 'apply', runId });
  expect(save).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

it.each([{ args: [] }, { args: ['--apply'] }])(
  'solo escribe una oferta válida en modo aplicación %j',
  async ({ args }) => {
    const save = jest
      .fn()
      .mockImplementation((observation: OnlineObservation) => Promise.resolve(observation));
    const request = jest
      .fn()
      .mockResolvedValueOnce(Response.json([{ id: 'r1', sellers: [{ id: 's1' }] }]))
      .mockResolvedValueOnce(
        Response.json([{ items: [{ itemId: '516338', ean: '7702552000097' }] }]),
      )
      .mockResolvedValueOnce(
        Response.json({
          country: 'COL',
          postalCode: '630001',
          items: [{ id: '516338', seller: 's1', availability: 'available', sellingPrice: 195000 }],
          logisticsInfo: [{ itemIndex: 0, slas: [{ deliveryChannel: 'delivery' }] }],
        }),
      );
    const result = await runOlimpicaPreview(
      args,
      env,
      () =>
        Promise.resolve({
          find: (ean: string) => Promise.resolve(ean === '7702552000097' ? ['p1'] : []),
          close: () => Promise.resolve(),
          save,
        }),
      request,
    );
    expect(result.rows[0]).toMatchObject({ status: 'available', priceCop: 1950 });
    expect(save).toHaveBeenCalledTimes(args.length);
  },
);

it('consulta el punto público de Armenia con el vendedor principal y confirma domicilio', async () => {
  const requests: (RequestInit | undefined)[] = [];
  const replies = [
    [{ items: [{ ean: '7702552000097', itemId: '516338' }] }],
    {
      country: 'COL',
      items: [{ id: '516338', seller: '1', availability: 'available', sellingPrice: 220000 }],
      logisticsInfo: [{ itemIndex: 0, slas: [{ deliveryChannel: 'delivery' }] }],
    },
  ];
  const result = await runOlimpicaPreview(
    [],
    { OLIMPICA_VTEX_LOCATION: 'armenia-centro', OLIMPICA_VTEX_EANS: env.OLIMPICA_VTEX_EANS },
    () =>
      Promise.resolve({
        find: (ean: string) => Promise.resolve(ean === '7702552000097' ? ['p1'] : []),
        close: () => Promise.resolve(),
      }),
    (_input, init) => {
      requests.push(init);
      return Promise.resolve(Response.json(replies.shift()));
    },
  );
  expect(result).toMatchObject({
    zoneId: 'armenia-centro',
    rows: [
      { status: 'available', priceCop: 2200, sellerId: '1' },
      { status: 'skipped' },
      { status: 'skipped' },
      { status: 'skipped' },
      { status: 'skipped' },
    ],
  });
  expect(requests[1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({
      items: [{ id: '516338', quantity: 1, seller: '1' }],
      geoCoordinates: [-75.6811, 4.5339],
      country: 'COL',
    }),
  });
});
