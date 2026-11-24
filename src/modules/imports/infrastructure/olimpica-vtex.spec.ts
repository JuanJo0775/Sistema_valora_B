import { OlimpicaVtex } from './olimpica-vtex';

const zone = { id: 'armenia-piloto', regionId: 'r1', sellerId: 'v1' };
const ean = '7702552000097';

it('confirma el vendedor con VTEX y usa el precio de la simulación de entrega', async () => {
  const response = [
    [{ id: 'r1', sellers: [{ id: 'v1' }] }],
    [
      {
        items: [
          { itemId: 'otro', ean: '7702511000014' },
          { itemId: '516338', ean },
        ],
      },
    ],
    {
      postalCode: '630001',
      country: 'COL',
      items: [{ id: '516338', seller: 'v1', availability: 'available', sellingPrice: 195000 }],
      logisticsInfo: [{ itemIndex: 0, slas: [{ deliveryChannel: 'delivery' }] }],
    },
  ];
  const requests: (RequestInit | undefined)[] = [];
  const client = new OlimpicaVtex('630001', (_input, init) => {
    requests.push(init);
    return Promise.resolve(Response.json(response.shift()));
  });

  await expect(client.confirms(zone)).resolves.toBe(true);
  await expect(client.quote(ean, zone)).resolves.toEqual({
    regionId: 'r1',
    sellerId: 'v1',
    skuId: '516338',
    available: true,
    priceCop: 1950,
  });
  expect(requests).toHaveLength(3);
  expect(requests[2]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({
      items: [{ id: '516338', quantity: 1, seller: 'v1' }],
      postalCode: '630001',
      country: 'COL',
    }),
  });
});

it('exige que VTEX reconozca el vendedor para esa región', async () => {
  const client = new OlimpicaVtex('630001', () =>
    Promise.resolve(Response.json([{ id: 'r1', sellers: [{ id: 'otro' }] }])),
  );
  await expect(client.confirms(zone)).resolves.toBe(false);
});

it('rechaza un precio del punto de prueba si la simulación solo ofrece recogida', async () => {
  const responses = [
    [{ items: [{ ean, itemId: '516338' }] }],
    {
      country: 'COL',
      items: [{ id: '516338', seller: '1', availability: 'available', sellingPrice: 220000 }],
      logisticsInfo: [{ itemIndex: 0, slas: [{ deliveryChannel: 'pickup-in-point' }] }],
    },
  ];
  const client = new OlimpicaVtex([-75.6811, 4.5339], () =>
    Promise.resolve(Response.json(responses.shift())),
  );
  await expect(
    client.quote(ean, { id: 'centro', regionId: 'centro', sellerId: '1' }),
  ).rejects.toThrow('invalid_response');
});
