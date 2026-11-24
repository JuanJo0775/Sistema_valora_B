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

it('reserva la aplicación de observaciones para la fase de persistencia', async () => {
  const open = jest.fn();
  await expect(runOlimpicaPreview(['--apply'], env, open)).rejects.toThrow(
    'solo admite vista previa',
  );
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
      ...Array.from({ length: 4 }, () => expect.objectContaining({ status: 'skipped' })),
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
