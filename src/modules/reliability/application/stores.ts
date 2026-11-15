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
  // Grill de la #32, pregunta 4: la decisión de moderación, si ya la hubo.
  moderation?: 'aprobado' | 'descartado';
}

// Puertos hacia las tablas propias de reliability.
export interface ObservationStore {
  forPresentation(presentationId: string, establishmentIds: string[]): Promise<Observation[]>;
  byReportId(reportId: string): Promise<Observation | null>;
  save(observation: Observation): Promise<void>;
}

// Grill de la #32: marcas, cola y bitácora.
export type FlagReason =
  'precio_falso' | 'producto_equivocado' | 'establecimiento_equivocado' | 'otro';

export interface NewFlag {
  reportId: string;
  flaggerKey: string;
  reason: FlagReason;
  comment?: string;
  createdAt: Date;
}

export type Decision = 'aprobar' | 'descartar' | 'observar_cuentas';

// Grill de la #71: la revisión de la #32 o la apelación del autor.
export type Stage = 'revision' | 'apelacion';

export interface LogEntry {
  reportId: string;
  decision: Decision;
  note: string;
  moderatorKey: string;
  decidedAt: Date;
  stage: Stage;
}

// Grill de la #71, pregunta 1: el autor apela una vez, con motivo.
export interface NewAppeal {
  reportId: string;
  note: string;
  createdAt: Date;
}

export interface AppealRecord {
  note: string;
  createdAt: Date;
  // null mientras nadie la decide.
  outcome: 'aceptada' | 'rechazada' | null;
}

export interface PendingItem {
  observation: Observation;
  // Cuántas cuentas lo marcaron como dudoso.
  flags: number;
  // Grill de la #71, pregunta 3: si es una apelación pendiente, el motivo del autor.
  appeal?: { note: string; createdAt: Date };
}

export interface ModerationStore {
  // false si esa cuenta ya había marcado ese reporte (RN1 de RF-013).
  flag(flag: NewFlag): Promise<boolean>;
  // Sospechosos o marcados que todavía no tienen decisión.
  pending(): Promise<PendingItem[]>;
  // Registra la decisión en la bitácora y, si aprueba o descarta, cambia el estado de la observación.
  decide(entry: LogEntry): Promise<void>;
  // Grill de la #33, pregunta 5: las decisiones de revisión sobre los reportes de una clave, en
  // orden. Grill de la #71, pregunta 4: un descarte revertido por una apelación cuenta como aprobar.
  decisionsAbout(reporterKey: string): Promise<Decision[]>;
  // Grill de la #71: false si el reporte ya tenía apelación.
  appeal(appeal: NewAppeal): Promise<boolean>;
  appealOf(reportId: string): Promise<AppealRecord | null>;
  // La última decisión de revisión sobre un reporte.
  revisionOf(reportId: string): Promise<LogEntry | null>;
}

export interface ReputationStore {
  // Solo las claves que tienen reputación guardada; las demás son neutras.
  valuesOf(reporterKeys: string[]): Promise<Map<string, number>>;
  // Pregunta 8: registra que el reporte ya dio su punto; false si ya lo había dado.
  claimPoint(reportId: string, reporterKey: string): Promise<boolean>;
  save(reporterKey: string, value: number): Promise<void>;
}
