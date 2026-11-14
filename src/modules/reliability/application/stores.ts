import type { AnomalyResult } from '../../../domain/anomaly';

// Grill de la #31, pregunta 3: copia propia de cada reporte recibido, con el veredicto al llegar. Solo
// la clave seudónima del reportante; nada que lo identifique (EC-08).
export interface Observation {
  reportId: string;
  presentationId: string;
  establishmentId: string;
  reporterKey: string;
  reporterSince: Date;
  priceCop: number;
  priceType: 'normal' | 'oferta';
  observedAt: Date;
  receivedAt: Date;
  verdict: AnomalyResult;
}

// Puertos hacia las tablas propias de reliability.
export interface ObservationStore {
  forPresentation(presentationId: string, establishmentIds: string[]): Promise<Observation[]>;
  save(observation: Observation): Promise<void>;
}

export interface ReputationStore {
  // Solo las claves que tienen reputación guardada; las demás son neutras.
  valuesOf(reporterKeys: string[]): Promise<Map<string, number>>;
  // Pregunta 8: registra que el reporte ya dio su punto; false si ya lo había dado.
  claimPoint(reportId: string, reporterKey: string): Promise<boolean>;
  save(reporterKey: string, value: number): Promise<void>;
}
