import { equivalentStoreNames } from '../../../domain/store-proposal';
import type { EstablishmentRepository } from './establishment-repository';
import type { StoreCorrection } from './store-details';
import { DUPLICATE_RADIUS_METERS } from './store-proposals-queue';

export interface StoreCorrectionsQueuePorts {
  corrections: { pending(): Promise<StoreCorrection[]> };
  stores: Pick<EstablishmentRepository, 'findById' | 'findWithinMeters'>;
}

interface PlaceAndName {
  name: string;
  lat: number;
  lng: number;
}

// Lo que el moderador necesita para decidir; nunca quién la pidió (EC-08).
export interface StoreCorrectionItem {
  kind: 'correccion';
  id: string;
  establishmentId: string;
  current: PlaceAndName;
  proposed: Partial<PlaceAndName>;
  possibleDuplicates: { id: string; name: string; distanceM: number }[];
  createdAt: Date;
}

// D5 del grill comercial: las correcciones de nombre y ubicación que esperan decisión, en la misma
// cola de las propuestas de tiendas (#27), la más antigua primero.
export class StoreCorrectionsQueue {
  constructor(private readonly ports: StoreCorrectionsQueuePorts) {}

  async list(): Promise<StoreCorrectionItem[]> {
    const { corrections, stores } = this.ports;
    const items: StoreCorrectionItem[] = [];
    for (const correction of await corrections.pending()) {
      const store = await stores.findById(correction.establishmentId);
      if (!store) continue;
      const { name, location } = correction;
      const nearby =
        name === undefined ? [] : await stores.findWithinMeters(store, DUPLICATE_RADIUS_METERS);
      items.push({
        kind: 'correccion',
        id: correction.id,
        establishmentId: store.id,
        current: { name: store.name, lat: store.lat, lng: store.lng },
        proposed: { ...(name === undefined ? {} : { name }), ...location },
        // RF-005 RN3: se sugiere, el moderador decide.
        possibleDuplicates: nearby.filter(
          (other) =>
            other.id !== store.id && name !== undefined && equivalentStoreNames(other.name, name),
        ),
        createdAt: correction.createdAt,
      });
    }
    return items;
  }
}
