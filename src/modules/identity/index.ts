// Interfaz pública del módulo identity. Otros módulos y AppModule importan solo desde aquí.
export { IdentityModule } from './identity.module';
export type { Role } from './application/account-repository';
export { ReporterIdentity, type ReporterPseudonym } from './application/reporter-identity';
// Grill de la #73, pregunta 4: el comando identity:set-role.
export { AccountsByRole } from './application/accounts-by-role';
export { ChangeRole } from './application/change-role';
// Comando db:seed-moderador: crea la cuenta con el mismo caso de uso del registro y le da el rol.
export { RegisterAccount } from './application/register-account';
export { ACCOUNT_REPOSITORY, type AccountRepository } from './application/account-repository';
export { PASSWORD_LENGTH } from './application/password-policy';
// B9 (#209): avisar a una cuenta por correo sin conocer la dirección.
export { NotifyAccount } from './application/notify-account';
export {
  AllowSuspended,
  type AuthenticatedSession,
  CurrentSession,
  Roles,
  SessionGuard,
} from './http/session.guard';
// ADR-029: pricing exige el correo verificado para registrar precios.
export { VerifiedEmailGuard } from './http/verified-email.guard';
