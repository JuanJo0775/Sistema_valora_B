import { type PriceFileError, readPriceFile } from '../../../domain/official-price-file';
import {
  assertOfficialPriceInRange,
  assessOfficialPrice,
  ImplausibleOfficialPriceError,
} from '../../../domain/price-plausibility';
import { createEvent } from '../../../shared/events';
import type { MerchantClaimRepository } from './merchant-claims';
import {
  OFFICIAL_PRICE_PUBLISHED,
  type OfficialPrice,
  type OfficialPriceRepository,
  type OfficialPriceReview,
} from './official-prices';
import {
  heldEvent,
  newReview,
  type PriceReference,
  verifiedEstablishmentOf,
} from './publish-official-price';

export interface UploadOfficialPricesPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  // El catálogo, por la interfaz pública de catalog: código de barras → presentación.
  presentations: { byBarcodes(barcodes: string[]): Promise<Map<string, string>> };
  prices: Pick<OfficialPriceRepository, 'saveAll'>;
  // ADR-037: la referencia de ADR-030, de pricing.
  reference: PriceReference;
  reporters: { keyOf(accountId: string): Promise<string> };
  clock: { now(): Date };
}

// ADR-037: una fila sin referencia con la que compararla: se aceptó, pero espera a moderación.
export interface PriceInReview {
  row: number;
  barcode: string;
  priceCop: number;
}

export interface UploadResult {
  published: number;
  // ADR-037: las filas aceptadas que quedaron «en revisión» (no cuentan en `published`).
  inReview: PriceInReview[];
  errors: PriceFileError[];
}

// Cuántas filas consultan su referencia a la vez: acota las consultas sin esperar fila por fila.
const REFERENCE_BATCH = 20;

// D7 del grill comercial (ADR-027): publica de una vez las filas buenas del archivo, reconfirmadas
// (D4), e informa las malas. Nunca crea un producto desde el archivo (RF-014). ADR-037: cada fila
// pasa por la misma evaluación que un precio suelto; las rechazadas salen como errores por fila y las
// que no tienen referencia se informan aparte, «en revisión».
export class UploadOfficialPrices {
  constructor(private readonly ports: UploadOfficialPricesPorts) {}

  async execute(accountId: string, text: string): Promise<UploadResult> {
    const { claims, presentations, prices, clock, reference, reporters } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, accountId);
    const file = readPriceFile(text);
    const known = await presentations.byBarcodes(file.rows.map((row) => row.barcode));
    const confirmedAt = clock.now();
    const published: OfficialPrice[] = [];
    const reviews: OfficialPriceReview[] = [];
    const inReview: PriceInReview[] = [];
    const errors = [...file.errors];
    const found = file.rows.flatMap((item) => {
      const presentationId = known.get(item.barcode);
      if (presentationId === undefined) {
        errors.push({
          row: item.row,
          barcode: item.barcode,
          code: 'UNKNOWN_BARCODE',
          message: 'Este código no está en Valora: propón el producto.',
        });
        return [];
      }
      return [{ ...item, presentationId }];
    });
    const reporterKey = found.length > 0 ? await reporters.keyOf(accountId) : '';
    for (let from = 0; from < found.length; from += REFERENCE_BATCH) {
      const batch = found.slice(from, from + REFERENCE_BATCH);
      const verdicts = await Promise.all(
        batch.map(async ({ presentationId, priceCop }) =>
          assessOfficialPrice(priceCop, await reference.of({ presentationId, establishmentId })),
        ),
      );
      batch.forEach(({ row, barcode, presentationId, priceCop }, index) => {
        const price = { establishmentId, presentationId, priceCop };
        try {
          const verdict = verdicts[index] as ReturnType<typeof assessOfficialPrice>;
          if (assertOfficialPriceInRange(priceCop, verdict) === 'sin_referencia') {
            reviews.push(newReview(price, confirmedAt));
            inReview.push({ row, barcode, priceCop });
          } else {
            published.push({ ...price, confirmedAt });
          }
        } catch (error) {
          if (!(error instanceof ImplausibleOfficialPriceError)) throw error;
          errors.push({ row, barcode, code: 'IMPLAUSIBLE_OFFICIAL_PRICE', message: error.message });
        }
      });
    }
    await prices.saveAll(
      published,
      [
        ...published.map((price) =>
          createEvent(OFFICIAL_PRICE_PUBLISHED, 1, {
            ...price,
            confirmedAt: price.confirmedAt.toISOString(),
          }),
        ),
        ...reviews.map((review) => heldEvent(review, reporterKey)),
      ],
      reviews,
    );
    return {
      published: published.length,
      inReview: inReview.sort((a, b) => a.row - b.row),
      errors: errors.sort((a, b) => a.row - b.row),
    };
  }
}
