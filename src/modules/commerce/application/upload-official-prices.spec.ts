import type { DomainEvent } from '../../../shared/events';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice } from './official-prices';
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

function setup(claim: MerchantClaim | null = merchant) {
  const saved: OfficialPrice[] = [];
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
      saveAll: (prices, published) => {
        saved.push(...prices);
        events.push(...published);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { upload, saved, events };
}

describe('cargar precios oficiales por archivo (D7 del grill comercial)', () => {
  it('publica las filas buenas, reconfirmadas, e informa las malas con su fila', async () => {
    const { upload, saved, events } = setup();
    const file = [
      'codigo_barras;precio',
      '7702511000014;2600',
      '9999999999999;3000',
      '7707211000016;50',
      '7707211000016;8900',
    ].join('\n');

    const result = await upload.execute('cuenta-de-dona-rosa', file);

    expect(result).toEqual({
      published: 2,
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
      { establishmentId: STORE, presentationId: 'aceite-1l', priceCop: 8900, confirmedAt: now },
    ]);
    expect(events).toHaveLength(2);
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

  it('sin tienda verificada no carga nada', async () => {
    const { upload, saved } = setup({ ...merchant, status: 'pre_aprobado', verifiedAt: null });

    await expect(
      upload.execute('cuenta-de-dona-rosa', 'codigo_barras;precio\n7702511000014;2600'),
    ).rejects.toThrow(MerchantNotVerifiedError);
    expect(saved).toEqual([]);
  });
});
