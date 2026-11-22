import { ttlDaysFor } from '../../../domain/freshness';
import { reconfirmationDue } from '../../../domain/reconfirmation';
import type { MerchantClaimRepository } from './merchant-claims';
import type { OfficialPriceRepository } from './official-prices';
import { verifiedEstablishmentOf } from './publish-official-price';

// Una discrepancia corroborada de la tienda, tal como la calcula comparison (D1, ADR-008).
export interface DiscrepancyNotice {
  presentationId: string;
  officialPriceCop: number;
  reportedPriceCop: number;
  reports: number;
  since: Date;
}

export interface MerchantAlertsPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  prices: Pick<OfficialPriceRepository, 'listFor'>;
  // La categoría y el nombre de la presentación, por la interfaz pública de catalog.
  presentations: { isFresh(presentationId: string): Promise<boolean | null> };
  labels: { labelsOf(presentationIds: string[]): Promise<Map<string, string>> };
  // La consulta pública de comparison (#209).
  discrepancies: { of(establishmentId: string): Promise<DiscrepancyNotice[]> };
  clock: { now(): Date };
}

interface AlertBase {
  presentationId: string;
  productName: string;
  message: string;
}

export type MerchantAlert =
  | (AlertBase & { kind: 'vence_pronto' | 'vencido'; confirmedAt: Date })
  | (AlertBase & Omit<DiscrepancyNotice, 'presentationId'> & { kind: 'discrepancia' });

const money = new Intl.NumberFormat('es-CO');

// B9 (#209): lo que el comercio debe atender. D4: reconfirmar un día antes de que venza el oficial.
// ADR-008: la comunidad corrobora otro precio.
export class MerchantAlerts {
  constructor(private readonly ports: MerchantAlertsPorts) {}

  async execute(accountId: string): Promise<MerchantAlert[]> {
    const { claims, prices, presentations, labels, discrepancies, clock } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, accountId);
    const now = clock.now();
    const official = await prices.listFor(establishmentId);
    const found = await discrepancies.of(establishmentId);
    const names = await labels.labelsOf([
      ...official.map((price) => price.presentationId),
      ...found.map((discrepancy) => discrepancy.presentationId),
    ]);
    const nameOf = (presentationId: string) => names.get(presentationId) ?? 'un producto';

    const alerts: MerchantAlert[] = [];
    for (const price of official) {
      const isFresh = (await presentations.isFresh(price.presentationId)) ?? false;
      const due = reconfirmationDue({
        confirmedAt: price.confirmedAt,
        ttlDays: ttlDaysFor(isFresh),
        now,
      });
      if (due === null) continue;
      const productName = nameOf(price.presentationId);
      alerts.push({
        kind: due,
        presentationId: price.presentationId,
        productName,
        confirmedAt: price.confirmedAt,
        message:
          due === 'vence_pronto'
            ? `Tu precio oficial de ${productName} vence mañana: reconfírmalo.`
            : `Tu precio oficial de ${productName} ya no está vigente: reconfírmalo para que vuelva a contar.`,
      });
    }
    for (const discrepancy of found) {
      const productName = nameOf(discrepancy.presentationId);
      alerts.push({
        kind: 'discrepancia',
        ...discrepancy,
        productName,
        message: `La comunidad reporta ${productName} a $${money.format(discrepancy.reportedPriceCop)} y tu precio oficial es $${money.format(discrepancy.officialPriceCop)} (${String(discrepancy.reports)} reportes).`,
      });
    }
    return alerts;
  }
}
