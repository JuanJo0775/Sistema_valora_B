import { type ReportState, reportStateOf } from './report-status';
import type { ModerationStore, Observation } from './stores';

export interface MyReportsPorts {
  moderation: Pick<ModerationStore, 'authoredBy'>;
  // Consultas públicas de catalog y establishments (por su index.ts).
  // Catalog dice el nombre y el producto de cada presentación (un lote, sin N+1).
  presentations: {
    of(presentationIds: string[]): Promise<Map<string, { label: string; productId: string }>>;
  };
  names: { of(establishmentIds: string[]): Promise<Map<string, string>> };
  clock: { now(): Date };
}

export interface MyReportsRequest {
  limit?: number;
  before?: Date;
}

// Grill de la #76, pregunta 2: lo que la pantalla «Mis aportes» muestra; nunca quién decidió ni
// quién marcó (EC-08).
export interface MyReportItem {
  reportId: string;
  // Para enlazar a /productos/:id; no viene si la presentación ya no existe en el catálogo.
  productId?: string;
  productName: string;
  establishmentName: string;
  priceCop: number;
  priceType: Observation['priceType'];
  observedAt: Date;
  status: ReportState;
  appealableUntil?: Date;
}

export interface MyReportsPage {
  items: MyReportItem[];
  nextBefore?: Date;
}

const UNNAMED = 'Sin nombre';
// Grill de la #76, pregunta 2.
export const DEFAULT_MY_REPORTS_LIMIT = 20;

// RF-006: los aportes de la cuenta con su estado, el más reciente primero.
export class MyReports {
  constructor(private readonly ports: MyReportsPorts) {}

  async list(reporterKey: string, request: MyReportsRequest): Promise<MyReportsPage> {
    const { moderation, presentations, names, clock } = this.ports;
    const limit = request.limit ?? DEFAULT_MY_REPORTS_LIMIT;
    const reports = await moderation.authoredBy(reporterKey, {
      limit,
      ...(request.before ? { before: request.before } : {}),
    });
    const [known, establishmentNames] = await Promise.all([
      presentations.of([...new Set(reports.map((report) => report.observation.presentationId))]),
      names.of([...new Set(reports.map((report) => report.observation.establishmentId))]),
    ]);
    const now = clock.now();
    // Con la página llena puede haber más: se piden con before = la llegada del último.
    const last = reports.at(-1);
    const nextBefore = reports.length === limit && last ? last.observation.receivedAt : undefined;
    return {
      ...(nextBefore ? { nextBefore } : {}),
      items: reports.map((report) => {
        const { observation } = report;
        const presentation = known.get(observation.presentationId);
        return {
          reportId: observation.reportId,
          ...(presentation ? { productId: presentation.productId } : {}),
          productName: presentation?.label ?? UNNAMED,
          establishmentName: establishmentNames.get(observation.establishmentId) ?? UNNAMED,
          priceCop: observation.priceCop,
          priceType: observation.priceType,
          observedAt: observation.observedAt,
          ...reportStateOf(report, now),
        };
      }),
    };
  }
}
