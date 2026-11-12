import type { EstablishmentType } from './establishment-repository';

// Tienda tal como la carga la semilla (issue #51), con id fijo ya calculado.
export interface EstablishmentImport {
  id: string;
  name: string;
  type: EstablishmentType;
  address?: string;
  lat: number;
  lng: number;
}

export interface EstablishmentImportRepository {
  // Inserta o actualiza por id: repetir la semilla no duplica (grill de la #51, pregunta 2).
  save(establishment: EstablishmentImport): Promise<void>;
  listIds(): Promise<string[]>;
}

export const ESTABLISHMENT_IMPORT_REPOSITORY = Symbol('ESTABLISHMENT_IMPORT_REPOSITORY');

// Puerta de entrada pública para que el módulo imports guarde tiendas sin tocar las tablas de establishments.
export class ImportEstablishments {
  constructor(private readonly establishments: EstablishmentImportRepository) {}

  save(establishment: EstablishmentImport): Promise<void> {
    return this.establishments.save(establishment);
  }

  listIds(): Promise<string[]> {
    return this.establishments.listIds();
  }
}
