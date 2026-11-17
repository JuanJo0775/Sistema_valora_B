// Interfaz pública del módulo establishments. Otros módulos y AppModule importan solo desde aquí.
export { EstablishmentsModule } from './establishments.module';
export {
  ImportEstablishments,
  type EstablishmentImport,
} from './application/import-establishments';
export { EstablishmentExists } from './application/establishment-exists';
export { EstablishmentDetails } from './application/establishment-details';
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
