// Interfaz pública del módulo establishments. Otros módulos y AppModule importan solo desde aquí.
export { EstablishmentsModule } from './establishments.module';
export {
  ImportEstablishments,
  type EstablishmentImport,
} from './application/import-establishments';
export type { EstablishmentType } from './application/establishment-repository';
