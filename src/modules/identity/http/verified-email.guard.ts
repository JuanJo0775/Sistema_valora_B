import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedSession } from './session.guard';

// Lo que el guard lee de la petición, sin depender de los tipos de Express.
interface SessionRequest {
  session?: AuthenticatedSession;
}

// ADR-029: exige que la cuenta de la sesión haya verificado su correo. Va después de SessionGuard
// (`@UseGuards(SessionGuard, VerifiedEmailGuard)`), que es quien resuelve la sesión.
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const session = context.switchToHttp().getRequest<SessionRequest>().session;
    if (!session?.emailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Verifica tu correo para registrar precios. Revisa tu bandeja o pide un enlace nuevo.',
      });
    }
    return true;
  }
}
