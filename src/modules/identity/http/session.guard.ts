import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.validation';
import type { Role } from '../application/account-repository';
import { isValidCsrfToken } from '../application/csrf';
import { type ActiveSession, ResolveSession } from '../application/resolve-session';
import { readSessionToken } from './session-cookie';

// La sesión de quien hace la petición, con su token para derivar el CSRF.
export interface AuthenticatedSession extends ActiveSession {
  token: string;
}

// Lo que el guard lee de la petición, sin depender de los tipos de Express.
interface SessionRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  session?: AuthenticatedSession;
}

const ROLES_KEY = 'identity.roles';
// Grill de la #16, pregunta 4: el CSRF lo exigen las rutas con sesión que modifican datos.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Roles permitidos en una ruta (pregunta 5). Sin el decorador, basta con tener sesión.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// Grill de la #71, pregunta 5: las únicas rutas que una cuenta suspendida puede usar (ver sus
// reportes, apelar, su sesión y cerrarla). Las demás responden 403 ACCOUNT_SUSPENDED.
const ALLOW_SUSPENDED_KEY = 'identity.allowSuspended';
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED_KEY, true);

// La sesión que el guard dejó en la petición.
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSession | undefined =>
    context.switchToHttp().getRequest<SessionRequest>().session,
);

const header = (request: SessionRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly resolveSession: ResolveSession,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const token = readSessionToken(header(request, 'cookie'));
    const session = token === undefined ? null : await this.resolveSession.execute(token);
    if (!session || token === undefined) throw new UnauthorizedException();

    const allowSuspended = Reflect.getMetadata(ALLOW_SUSPENDED_KEY, context.getHandler()) === true;
    if (session.suspendedUntil && !allowSuspended) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: `La cuenta está suspendida hasta ${session.suspendedUntil.toISOString()}; solo puede ver sus reportes y apelar.`,
      });
    }

    // SetMetadata guarda los roles en la función de la ruta; se leen sin inyectar Reflector.
    const roles = Reflect.getMetadata(ROLES_KEY, context.getHandler()) as Role[] | undefined;
    if (roles && !roles.includes(session.role)) throw new ForbiddenException();

    const secret = this.config.get('SESSION_SECRET', { infer: true });
    if (
      MUTATING_METHODS.has(request.method) &&
      !isValidCsrfToken(header(request, 'x-csrf-token'), token, secret)
    ) {
      throw new ForbiddenException({
        code: 'CSRF_TOKEN_INVALID',
        message: 'Falta el token CSRF o no coincide con la sesión.',
      });
    }

    request.session = { ...session, token };
    return true;
  }
}
