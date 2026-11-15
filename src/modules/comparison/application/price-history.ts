import { dailyHistory, type DailyPoint, historyWindow } from '../../../domain/price-history';
import type { PresentationLabels, ProductForComparison } from '../../catalog';
import type { PriceHistoryRepository } from './price-history-repository';

export interface PriceHistoryPorts {
  products: Pick<ProductForComparison, 'find'>;
  labels: Pick<PresentationLabels, 'of'>;
  history: PriceHistoryRepository;
  clock: { now(): Date };
}

// Grill de la #83, pregunta 5 (RN1): por ahora todos los precios son reportados; commerce agregará
// los oficiales en el Corte 3 sin cambiar la forma.
export interface HistoryPoint extends DailyPoint {
  source: 'reportado';
}

export interface ProductPriceHistory {
  from: string;
  to: string;
  presentations: { presentationId: string; label: string; points: HistoryPoint[] }[];
}

// RF-008 RN4: la evolución del precio de un producto en los últimos 30 días, por presentación.
export class PriceHistory {
  constructor(private readonly ports: PriceHistoryPorts) {}

  async of(
    productId: string,
    filter: { establishmentId?: string },
  ): Promise<ProductPriceHistory | null> {
    const { products, labels, history, clock } = this.ports;
    const product = await products.find(productId);
    if (!product) return null;
    const ids = product.presentations.map((presentation) => presentation.id);
    const now = clock.now();
    const { since } = historyWindow(now);
    const [names, prices] = await Promise.all([
      labels.of(ids),
      history.countedSince(ids, since, filter.establishmentId),
    ]);
    const { from, to, series } = dailyHistory(prices, now);
    return {
      from,
      to,
      presentations: ids.map((presentationId) => ({
        presentationId,
        label: names.get(presentationId) ?? '',
        points: (series.get(presentationId) ?? []).map((point) => ({
          ...point,
          source: 'reportado' as const,
        })),
      })),
    };
  }
}
