import type { Municipality } from '../../../domain/municipality';
import type { EstablishmentType } from '../../establishments';
import { isValidNit } from '../../../domain/merchant-claim';
import { claimPathFor } from '../../../domain/chain-store';
import {
  AccountHasEstablishmentError,
  ChainStoreNotClaimableError,
  InvalidNitError,
} from './claim-establishment';
import { PRE_APPROVED_UNLOCKS, type MerchantClaimRepository } from './merchant-claims';

type Point = { lat: number; lng: number };

// La tienda que no está en el mapa, en el punto del celular (D2).
export interface ProposedStore extends Point {
  name: string;
  type: EstablishmentType;
  address?: string;
  municipality: Municipality;
}

export interface ClaimProposedEstablishmentPorts {
  // La cola de propuestas de establishments (RF-005 RN7). Devuelve el id de la propuesta, que será
  // el id de la tienda al aprobarse.
  proposals: { propose(store: ProposedStore, accountId: string): Promise<string> };
  claims: Pick<MerchantClaimRepository, 'establishmentOf' | 'save'>;
  clock: { now(): Date };
}

export interface ProposedClaimRequest {
  accountId: string;
  newEstablishment: Omit<ProposedStore, 'lat' | 'lng'>;
  responsibleName: string;
  nit?: string;
  phone: string;
  acceptedTermsVersion: string;
  // El celular está en la tienda: su ubicación marca el punto de la tienda propuesta.
  location: Point;
}

export interface ProposedClaimResult {
  status: 'pre_aprobado';
  establishmentId: string;
  unlocks: typeof PRE_APPROVED_UNLOCKS;
}

// RF-015 con la D2 del grill comercial: el comercio registra una tienda que no está en el mapa.
export class ClaimProposedEstablishment {
  constructor(private readonly ports: ClaimProposedEstablishmentPorts) {}

  async execute(request: ProposedClaimRequest): Promise<ProposedClaimResult> {
    if (request.nit !== undefined && !isValidNit(request.nit)) throw new InvalidNitError();
    // H11 y ADR-038: nadie es dueño de una cadena, tampoco proponiéndola como tienda nueva.
    const { name, type } = request.newEstablishment;
    if (claimPathFor(name, type) === 'cadena') throw new ChainStoreNotClaimableError();
    const { proposals, claims } = this.ports;
    // D3: una tienda por cuenta, también mientras espera la aprobación.
    if ((await claims.establishmentOf(request.accountId)) !== null) {
      throw new AccountHasEstablishmentError();
    }
    const establishmentId = await proposals.propose(
      { ...request.newEstablishment, ...request.location },
      request.accountId,
    );
    await claims.save(
      {
        accountId: request.accountId,
        establishmentId,
        responsibleName: request.responsibleName.trim(),
        nit: request.nit ?? null,
        informal: request.nit === undefined,
        phone: request.phone,
        acceptedTermsVersion: request.acceptedTermsVersion,
        status: 'pre_aprobado',
        verifiedAt: null,
        // H36 (ADR-040): solo quien crea la tienda puede eliminarla.
        createdEstablishment: true,
      },
      [],
    );
    return { status: 'pre_aprobado', establishmentId, unlocks: PRE_APPROVED_UNLOCKS };
  }
}
