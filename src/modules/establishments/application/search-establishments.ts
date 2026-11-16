import type { Municipality } from '../../../domain/municipality';
import type { EstablishmentDetail, EstablishmentRepository } from './establishment-repository';

export interface SearchEstablishmentsInput {
  q?: string;
  municipality?: Municipality;
  limit: number;
}

// #116: elegir la tienda sin la ubicación del usuario (EC-08). Sin reglas de negocio propias.
export class SearchEstablishments {
  constructor(private readonly establishments: EstablishmentRepository) {}

  execute(input: SearchEstablishmentsInput): Promise<EstablishmentDetail[]> {
    return this.establishments.search(input);
  }
}
