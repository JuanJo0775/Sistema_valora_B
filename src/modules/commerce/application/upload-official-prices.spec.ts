import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice, OfficialPriceReview } from './official-prices';
import { MerchantNotVerifiedError } from './publish-official-price';
import { UploadOfficialPrices } from './upload-official-prices';

const now = new Date('2026-11-22T10:00:00Z');
const STORE = 'tienda-esperanza';

const merchant: MerchantClaim = {
  accountId: 'cuenta-de-dona-rosa',
  establishmentId: STORE,
  responsibleName: 'Rosa Gómez',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
};

// El catálogo conoce dos códigos de barras.
const CATALOG: Record<string, string> = {
  '7702511000014': 'arroz-500g',
  '7707211000016': 'aceite-1l',
};

// La referencia de ADR-030: tres tiendas del municipio cobran cerca de esos precios; el aceite no
// tiene referencia (sin_datos).
const PEERS: Record<string, number[]> = {
  'arroz-500g': [2500, 2600, 2700],
  'aceite-1l': [],
};

function setup(claim: MerchantClaim | null = merchant) {
  const saved: OfficialPrice[] = [];
  const reviews: OfficialPriceReview[] = [];
  const events: DomainEvent[] = [];
  const upload = new UploadOfficialPrices({
    claims: { findByAccount: () => Promise.resolve(claim) },
    presentations: {
      byBarcodes: (barcodes) =>
        Promise.resolve(
          new Map(barcodes.flatMap((code) => (CATALOG[code] ? [[code, CATALOG[code]]] : []))),
        ),
    },
    prices: {
      saveAll: (prices, published, held = []) => {
        saved.push(...prices);
        reviews.push(...held);
        events.push(...published);
        return Promise.resolve();
      },
    },
    reference: {
      of: ({ presentationId }) => Promise.resolve({ peerPricesCop: PEERS[presentationId] ?? [] }),
    },
    reporters: { keyOf: () => Promise.resolve('clave-de-rosa') },
    clock: { now: () => now },
  });
  return { upload, saved, reviews, events };
}

describe('cargar precios oficiales por archivo (D7 del grill comercial)', () => {
  it('publica las filas buenas, reconfirmadas, e informa las malas con su fila', async () => {
    const { upload, saved, reviews, events } = setup();
    const file = [
      'codigo_barras;precio',
      '7702511000014;2600',
      '9999999999999;3000',
      '7707211000016;50',
      '7707211000016;8900',
    ].join('\n');

    const result = await upload.execute('cuenta-de-dona-rosa', file);

    expect(result).toEqual({
      published: 1,
      // El aceite no tiene referencia: se acepta, pero queda en revisión (ADR-037).
      inReview: [{ row: 5, barcode: '7707211000016', priceCop: 8900 }],
      errors: [
        {
          row: 3,
          barcode: '9999999999999',
          code: 'UNKNOWN_BARCODE',
          message: 'Este código no está en Valora: propón el producto.',
        },
        expect.objectContaining({ row: 4, code: 'INVALID_PRICE' }),
        // La fila 5 repite el código de la 4, que no era válida: vale como la primera buena.
      ],
    });
    expect(saved).toEqual([
      { establishmentId: STORE, presentationId: 'arroz-500g', priceCop: 2600, confirmedAt: now },
    ]);
    expect(reviews).toEqual([
      {
        reviewId: expect.any(String) as unknown,
        establishmentId: STORE,
        presentationId: 'aceite-1l',
        priceCop: 8900,
        submittedAt: now,
      },
    ]);
    expect(events.map((event) => event.type)).toEqual([
      'OfficialPricePublished',
      'OfficialPriceHeld',
    ]);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'OfficialPricePublished',
        payload: {
          establishmentId: STORE,
          presentationId: 'arroz-500g',
          priceCop: 2600,
          confirmedAt: now.toISOString(),
        },
      }),
    );
  });

  // ADR-037: las filas claramente fuera de rango salen como errores por fila, con el mismo mensaje
  // que el 422 de PUT /commerce/prices, y no se guardan ni se publican.
  it('rechaza por fila los precios fuera del rango de la referencia, con el rango en el mensaje', async () => {
    const { upload, saved, reviews, events } = setup();
    const file = ['codigo_barras;precio', '7702511000014;300'].join('\n');

    const result = await upload.execute('cuenta-de-dona-rosa', file);

    expect(result.published).toBe(0);
    expect(result.inReview).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 2, code: 'IMPLAUSIBLE_OFFICIAL_PRICE' }),
    ]);
    expect(result.errors[0]?.message).toContain(
      'Lo más barato que vemos es $2.500 y lo más caro $2.700',
    );
    expect(saved).toEqual([]);
    expect(reviews).toEqual([]);
    expect(events).toEqual([]);
  });

  it('un precio muy alto se rechaza sin frenar las demás filas', async () => {
    const { upload, saved } = setup();
    const file = ['codigo_barras;precio', '7702511000014;52000', '7707211000016;8900'].join('\n');

    const result = await upload.execute('cuenta-de-dona-rosa', file);

    expect(result.errors).toEqual([
      expect.objectContaining({ row: 2, code: 'IMPLAUSIBLE_OFFICIAL_PRICE' }),
    ]);
    expect(result.inReview).toEqual([{ row: 3, barcode: '7707211000016', priceCop: 8900 }]);
    expect(saved).toEqual([]);
  });

  it('sin tienda verificada no carga nada', async () => {
    const { upload, saved } = setup({ ...merchant, status: 'pre_aprobado', verifiedAt: null });

    await expect(
      upload.execute('cuenta-de-dona-rosa', 'codigo_barras;precio\n7702511000014;2600'),
    ).rejects.toThrow(MerchantNotVerifiedError);
    expect(saved).toEqual([]);
  });
});
