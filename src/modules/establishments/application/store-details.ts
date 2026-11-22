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
