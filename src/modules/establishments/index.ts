// Interfaz pública del módulo establishments. Otros módulos y AppModule importan solo desde aquí.
export { EstablishmentsModule } from './establishments.module';
export {
  ImportEstablishments,
  type EstablishmentImport,
} from './application/import-establishments';
export { EstablishmentExists } from './application/establishment-exists';
// H36 (ADR-040): comparison deja fuera del historial las tiendas retiradas.
export { RetiredEstablishments } from './application/retired-establishments';
export { EstablishmentDetails } from './application/establishment-details';
// D2 del grill comercial: commerce propone la tienda de un comercio y muestra su nombre mientras espera.
export { StoreProposalsQueue } from './application/store-proposals-queue';
export { StoreCorrectionsQueue } from './application/store-corrections-queue';
export { ProposeStore } from './application/propose-store';
export { PendingStoreProposalName } from './application/pending-store-proposal-name';
// H5: puerto por el que commerce dice qué propuestas nacen de un reclamo.
export {
  ProposalClaims,
  type ProposalClaim,
  type ProposalClaimSource,
} from './application/proposal-claims';
// D5 (#207): datos del negocio para la ficha de la tienda.
export { StoreContactOf } from './application/store-contact-of';
export { UpdateStoreDetails } from './application/update-store-details';
export type { StoreContact } from './application/store-details';
export { EstablishmentNames } from './application/establishment-names';
export { EstablishmentsAround } from './application/establishments-around';
export { EstablishmentsWithinRadius } from './application/establishments-within-radius';
export { ListNearbyEstablishments } from './application/list-nearby-establishments';
export { SearchEstablishments } from './application/search-establishments';
export type {
  AroundQuery,
  EstablishmentDetail,
  EstablishmentType,
  InMunicipalityQuery,
  NearbyEstablishment,
  WithinRadiusQuery,
} from './application/establishment-repository';
