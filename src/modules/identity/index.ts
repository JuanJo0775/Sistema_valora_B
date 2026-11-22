// Interfaz pública del módulo identity. Otros módulos y AppModule importan solo desde aquí.
export { IdentityModule } from './identity.module';
export type { Role } from './application/account-repository';
export { ReporterIdentity, type ReporterPseudonym } from './application/reporter-identity';
// Grill de la #73, pregunta 4: el comando identity:set-role.
export { ChangeRole } from './application/change-role';
// D3 del grill comercial: commerce lo usa al verificar una tienda.
export { GrantMerchantRole } from './application/grant-merchant-role';
export {
  AllowSuspended,
  type AuthenticatedSession,
  CurrentSession,
  Roles,
  SessionGuard,
} from './http/session.guard';
// ADR-029: pricing exige el correo verificado para registrar precios.
export { VerifiedEmailGuard } from './http/verified-email.guard';
