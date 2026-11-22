import type { OpeningHours } from '../../../domain/opening-hours';
import type { StoreCorrections, StoreDetailsChange, StoreDetailsRepository } from './store-details';

export interface UpdateStoreDetailsPorts {
  stores: StoreDetailsRepository;
  corrections: StoreCorrections;
  clock: { now(): Date };
}

export interface UpdateStoreDetailsRequest {
  establishmentId: string;
  openingHours?: OpeningHours;
  phone?: string;
  name?: string;
  location?: { lat: number; lng: number };
  // Clave seudónima de quien lo pide (EC-08).
  proposerKey: string;
}

export interface UpdateStoreDetailsResult {
  applied: (keyof StoreDetailsChange)[];
  inReview: ('name' | 'location')[];
}

// D5 del grill comercial: el comercio corrige los datos de su tienda; commerce lo pide por la
// interfaz pública de establishments.
export class UpdateStoreDetails {
  constructor(private readonly ports: UpdateStoreDetailsPorts) {}

  async execute(request: UpdateStoreDetailsRequest): Promise<UpdateStoreDetailsResult> {
    const change: StoreDetailsChange = {
      ...(request.openingHours === undefined ? {} : { openingHours: request.openingHours }),
      ...(request.phone === undefined ? {} : { phone: request.phone }),
      ...(request.name === undefined ? {} : { name: request.name.trim() }),
    };
    await this.ports.stores.applyDetails(request.establishmentId, change);
    return { applied: Object.keys(change) as (keyof StoreDetailsChange)[], inReview: [] };
  }
}
