import { ttlDaysFor } from '../../../domain/freshness';
import type { Discrepancy } from '../../../domain/official-vs-reported';
import type { OfficialPriceCopies } from './official-price-copies';
import { resolveOfficial, type StoreReports } from './official-resolution';

export interface OfficialDiscrepanciesPorts {
  officials: Pick<OfficialPriceCopies, 'findByEstablishment'>;
  reliability: StoreReports;
  // La categoría de la presentación, por la interfaz pública de catalog (ADR-005).
  presentations: { isFresh(presentationId: string): Promise<boolean | null> };
  clock: { now(): Date };
}

export interface StoreDiscrepancy extends Discrepancy {
  presentationId: string;
}

// Puerta de entrada pública (B9, #209): las discrepancias corroboradas de una tienda, con la misma
// regla que la comparación (D1). commerce avisa al comercio; el núcleo no conoce commerce.
export class OfficialDiscrepancies {
  constructor(private readonly ports: OfficialDiscrepanciesPorts) {}

  async of(establishmentId: string): Promise<StoreDiscrepancy[]> {
    const { officials, reliability, presentations, clock } = this.ports;
    const now = clock.now();
    const found: StoreDiscrepancy[] = [];
    for (const official of await officials.findByEstablishment(establishmentId)) {
      const isFresh = (await presentations.isFresh(official.presentationId)) ?? false;
      const { resolved } = await resolveOfficial(official, reliability, now, ttlDaysFor(isFresh));
      if (resolved.kind === 'discrepancia') {
        found.push({ presentationId: official.presentationId, ...resolved.discrepancy });
      }
    }
    return found;
  }
}
