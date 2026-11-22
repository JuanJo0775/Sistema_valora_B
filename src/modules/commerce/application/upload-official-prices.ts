import { type PriceFileError, readPriceFile } from '../../../domain/official-price-file';
import { createEvent } from '../../../shared/events';
import type { MerchantClaimRepository } from './merchant-claims';
import {
  OFFICIAL_PRICE_PUBLISHED,
  type OfficialPrice,
  type OfficialPriceRepository,
} from './official-prices';
import { verifiedEstablishmentOf } from './publish-official-price';

export interface UploadOfficialPricesPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  // El catálogo, por la interfaz pública de catalog: código de barras → presentación.
  presentations: { byBarcodes(barcodes: string[]): Promise<Map<string, string>> };
  prices: Pick<OfficialPriceRepository, 'saveAll'>;
  clock: { now(): Date };
}

export interface UploadResult {
  published: number;
  errors: PriceFileError[];
}

// D7 del grill comercial (ADR-027): publica de una vez las filas buenas del archivo, reconfirmadas
// (D4), e informa las malas. Nunca crea un producto desde el archivo (RF-014).
export class UploadOfficialPrices {
  constructor(private readonly ports: UploadOfficialPricesPorts) {}

  async execute(accountId: string, text: string): Promise<UploadResult> {
    const { claims, presentations, prices, clock } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, accountId);
    const file = readPriceFile(text);
    const known = await presentations.byBarcodes(file.rows.map((row) => row.barcode));
    const confirmedAt = clock.now();
    const published: OfficialPrice[] = [];
    const errors = [...file.errors];
    for (const { row, barcode, priceCop } of file.rows) {
      const presentationId = known.get(barcode);
      if (presentationId === undefined) {
        errors.push({
          row,
          barcode,
          code: 'UNKNOWN_BARCODE',
          message: 'Este código no está en Valora: propón el producto.',
        });
      } else {
        published.push({ establishmentId, presentationId, priceCop, confirmedAt });
      }
    }
    await prices.saveAll(
      published,
      published.map((price) =>
        createEvent(OFFICIAL_PRICE_PUBLISHED, 1, {
          ...price,
          confirmedAt: price.confirmedAt.toISOString(),
        }),
      ),
    );
    return { published: published.length, errors: errors.sort((a, b) => a.row - b.row) };
  }
}
