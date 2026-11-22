import type { Municipality } from '../../../domain/municipality';
import type { EstablishmentType } from '../../establishments';
import { AccountHasEstablishmentError } from './claim-establishment';
import type { MerchantClaimRepository } from './merchant-claims';

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

// D2: lo que el comercio podrá hacer cuando se apruebe su tienda.
export const PRE_APPROVED_UNLOCKS = [
  'precios_oficiales',
  'carga_por_archivo',
  'promociones',
  'avisos_de_precio',
  'datos_de_la_tienda',
] as const;

export interface ProposedClaimResult {
  status: 'pre_aprobado';
  establishmentId: string;
  unlocks: typeof PRE_APPROVED_UNLOCKS;
}

// RF-015 con la D2 del grill comercial: el comercio registra una tienda que no está en el mapa.
export class ClaimProposedEstablishment {
  constructor(private readonly ports: ClaimProposedEstablishmentPorts) {}

  async execute(request: ProposedClaimRequest): Promise<ProposedClaimResult> {
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
      },
      [],
    );
    return { status: 'pre_aprobado', establishmentId, unlocks: PRE_APPROVED_UNLOCKS };
  }
}
