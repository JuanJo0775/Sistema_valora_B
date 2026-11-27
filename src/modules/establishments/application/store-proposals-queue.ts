import { equivalentStoreNames, isInServiceArea } from '../../../domain/store-proposal';
import { type Municipality, suggestedMunicipality } from '../../../domain/municipality';
import type { EstablishmentRepository, EstablishmentType } from './establishment-repository';
import type { ProposalClaim, ProposalClaimSource } from './proposal-claims';
import type { StoreProposalRepository } from './store-proposals';

export interface StoreProposalsQueuePorts {
  proposals: Pick<StoreProposalRepository, 'pending'>;
  stores: Pick<EstablishmentRepository, 'findWithinMeters'>;
  // H5: qué propuestas nacen de un reclamo de comercio.
  claims: ProposalClaimSource;
}

// Grill de la #27, pregunta 2: distancia provisional para sugerir un duplicado (RF-005 RN3).
export const DUPLICATE_RADIUS_METERS = 50;

// Lo que el moderador necesita para decidir; nunca quién propuso (EC-08).
export interface StoreProposalItem {
  id: string;
  name: string;
  type: EstablishmentType;
  address?: string;
  lat: number;
  lng: number;
  municipality: Municipality;
  outOfZone: boolean;
  // H16: solo si la ubicación parece de otro municipio que el declarado; es un aviso, no un rechazo.
  suggestedMunicipality?: Municipality;
  possibleDuplicates: { id: string; name: string; distanceM: number }[];
  createdAt: Date;
  // H5: solo si la propuesta nace de un reclamo; aprobarla verifica al solicitante.
  claim?: ProposalClaim;
}

// RF-005: las tiendas propuestas que esperan decisión, la más antigua primero.
export class StoreProposalsQueue {
  constructor(private readonly ports: StoreProposalsQueuePorts) {}

  // #257: cuántas esperan decisión; es parte del número de la pestaña «Tiendas».
  async count(): Promise<number> {
    return (await this.ports.proposals.pending()).length;
  }

  async list(): Promise<StoreProposalItem[]> {
    const pending = await this.ports.proposals.pending();
    const claims = await this.ports.claims.of(pending.map((proposal) => proposal.id));
    return Promise.all(
      pending.map(async ({ proposerKey: _proposerKey, ...proposal }) => {
        const claim = claims.get(proposal.id);
        const outOfZone = !isInServiceArea(proposal);
        // Fuera de la zona el centro más cercano no dice nada: ya va marcada.
        const suggested = outOfZone
          ? undefined
          : suggestedMunicipality(proposal.municipality, proposal);
        const nearby = await this.ports.stores.findWithinMeters(proposal, DUPLICATE_RADIUS_METERS);
        return {
          ...proposal,
          ...(claim ? { claim } : {}),
          // RN1: fuera de la zona no se rechaza sola; el moderador decide.
          outOfZone,
          ...(suggested ? { suggestedMunicipality: suggested } : {}),
          // RN3: se sugiere, nunca se fusiona sola.
          possibleDuplicates: nearby.filter((store) =>
            equivalentStoreNames(store.name, proposal.name),
          ),
        };
      }),
    );
  }
}
