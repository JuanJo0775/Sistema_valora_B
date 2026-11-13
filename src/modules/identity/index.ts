// Interfaz pública del módulo identity. Otros módulos y AppModule importan solo desde aquí.
export { IdentityModule } from './identity.module';
export type { Role } from './application/account-repository';
export {
  type AuthenticatedSession,
  CurrentSession,
  Roles,
  SessionGuard,
} from './http/session.guard';
