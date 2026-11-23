import type { OpeningHours } from '../../../domain/opening-hours';
import type { EstablishmentRepository } from './establishment-repository';

// D5 del grill comercial: lo que el comercio cambia al instante en su tienda.
export interface StoreDetailsChange {
  openingHours?: OpeningHours;
  phone?: string;
  name?: string;
}

// D5: lo que pasa por el moderador, en la cola de propuestas de tiendas (#27) como «corrección».
export interface StoreCorrection {
  id: string;
  establishmentId: string;
  name?: string;
  location?: { lat: number; lng: number };
  // Clave seudónima de quien la pide (EC-08).
  proposerKey: string;
  createdAt: Date;
}

// D5: lo que la ficha pública muestra del negocio, si el comercio lo puso (EC-08: no es de una persona).
export interface StoreContact {
  openingHours?: OpeningHours;
  phone?: string;
}

// Puertos hacia las tablas propias del módulo.
export interface StoreDetailsRepository extends Pick<
  EstablishmentRepository,
  'findById' | 'findWithinMeters'
> {
  applyDetails(establishmentId: string, change: StoreDetailsChange): Promise<void>;
}

export interface StoreCorrections {
  propose(correction: StoreCorrection): Promise<void>;
}

// D5: la decisión del moderador sobre una corrección; no se fusiona.
export interface StoreCorrectionDecisionRecord {
  correctionId: string;
  decision: 'aprobar' | 'rechazar';
  note: string;
  moderatorKey: string;
  decidedAt: Date;
}

export interface StoreCorrectionDecisions {
  // Aprobar aplica el nombre o la ubicación a la tienda en la misma transacción. Devuelve la
  // corrección decidida, o null si no existe o ya se decidió.
  decide(record: StoreCorrectionDecisionRecord): Promise<StoreCorrection | null>;
}
