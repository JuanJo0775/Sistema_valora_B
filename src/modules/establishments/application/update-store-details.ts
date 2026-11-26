import { randomUUID } from 'node:crypto';
import { createEvent } from '../../../shared/events';
import { assertValidOpeningHours, type OpeningHours } from '../../../domain/opening-hours';
import { equivalentStoreNames } from '../../../domain/store-proposal';
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

// D5: un nombre igual al de otra tienda a menos de esta distancia pasa por el moderador.
export const NEIGHBOR_NAME_METERS = 50;

// #260: moderación se entera por el outbox de que hay una corrección nueva. Solo lleva el id (EC-08).
export const STORE_CORRECTION_REQUESTED = 'StoreCorrectionRequested';

// D5 del grill comercial: el comercio corrige los datos de su tienda; commerce lo pide por la
// interfaz pública de establishments.
export class UpdateStoreDetails {
  constructor(private readonly ports: UpdateStoreDetailsPorts) {}

  async execute(request: UpdateStoreDetailsRequest): Promise<UpdateStoreDetailsResult> {
    if (request.openingHours !== undefined) assertValidOpeningHours(request.openingHours);
    const { stores, corrections, clock } = this.ports;
    const name = request.name?.trim();
    const nameInReview = name !== undefined && (await this.copiesANeighbor(request, name));
    const change: StoreDetailsChange = {
      ...(request.openingHours === undefined ? {} : { openingHours: request.openingHours }),
      ...(request.phone === undefined ? {} : { phone: request.phone }),
      ...(name === undefined || nameInReview ? {} : { name }),
    };
    await stores.applyDetails(request.establishmentId, change);
    // D5: la ubicación siempre pasa por el moderador; el nombre, si copia el de una vecina.
    const inReview = {
      ...(nameInReview ? { name } : {}),
      ...(request.location === undefined ? {} : { location: request.location }),
    };
    if (Object.keys(inReview).length > 0) {
      const id = randomUUID();
      await corrections.propose(
        {
          id,
          establishmentId: request.establishmentId,
          ...inReview,
          proposerKey: request.proposerKey,
          createdAt: clock.now(),
        },
        [createEvent(STORE_CORRECTION_REQUESTED, 1, { correctionId: id })],
      );
    }
    return {
      applied: Object.keys(change) as (keyof StoreDetailsChange)[],
      inReview: Object.keys(inReview) as ('name' | 'location')[],
    };
  }

  // RF-005 RN3 (#27): el nombre es equivalente al de otra tienda cercana.
  private async copiesANeighbor(
    { establishmentId }: UpdateStoreDetailsRequest,
    name: string,
  ): Promise<boolean> {
    const { stores } = this.ports;
    const store = await stores.findById(establishmentId);
    if (!store) return false;
    const neighbors = await stores.findWithinMeters(store, NEIGHBOR_NAME_METERS);
    return neighbors.some(
      (neighbor) => neighbor.id !== establishmentId && equivalentStoreNames(neighbor.name, name),
    );
  }
}
