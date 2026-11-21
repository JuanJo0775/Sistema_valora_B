import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { TooManyAttemptsError } from '../application/attempt-limiter';
import {
  AccountGoneError,
  DeleteOwnAccount,
  InvalidPasswordError,
  LastModeratorError,
  PasswordRequiredError,
  ReauthRequiredError,
} from '../application/delete-own-account';
import { DeleteAccountDto } from './auth.dto';
import type { ClientRequest, CookieResponse } from './auth.controller';
import { RequestValidationError } from '../../../shared/http/validation';
import { clearedSessionCookie } from './session-cookie';
import {
  AllowSuspended,
  type AuthenticatedSession,
  CurrentSession,
  SessionGuard,
} from './session.guard';

// Sin correo ni id (EC-08): solo la fecha en que se borrará la cuenta.
export interface AccountDeletionResponse {
  scheduledFor: string;
}

@Controller('me')
export class MeController {
  constructor(private readonly deleteOwnAccount: DeleteOwnAccount) {}

  // ADR-032, derecho de supresión (Ley 1581, art. 8). Cualquier rol, también una cuenta suspendida: nadie
  // pierde este derecho por estar sancionado. Exige sesión, el token CSRF (es un POST) y la contraseña.
  // Responde 202: la cuenta queda pendiente y se borra en 10 días si no se restaura.
  @Post('account-deletion')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @AllowSuspended()
  async requestDeletion(
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: DeleteAccountDto,
    @Req() request: ClientRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AccountDeletionResponse> {
    try {
      const { scheduledFor } = await this.deleteOwnAccount.execute({
        accountId: session.accountId,
        ...(body.password === undefined ? {} : { password: body.password }),
        sessionCreatedAt: session.createdAt,
        ip: request.ip ?? 'desconocida',
      });
      // Todas las sesiones quedaron revocadas en el servidor; se limpia también la cookie del navegador.
      response.setHeader('Set-Cookie', clearedSessionCookie());
      return { scheduledFor: scheduledFor.toISOString() };
    } catch (error) {
      if (error instanceof TooManyAttemptsError) {
        throw new HttpException(
          { retryAfterSeconds: error.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof InvalidPasswordError) {
        throw new ForbiddenException({ code: 'INVALID_PASSWORD', message: error.message });
      }
      if (error instanceof LastModeratorError) {
        throw new ForbiddenException({
          code: 'LAST_MODERATOR_CANNOT_DELETE',
          message: error.message,
        });
      }
      if (error instanceof PasswordRequiredError) {
        throw new RequestValidationError('password: debe ser texto');
      }
      // ADR-033: cuenta de Google con una sesión de más de 10 minutos; el frontend pide volver a entrar.
      if (error instanceof ReauthRequiredError) {
        throw new ForbiddenException({ code: 'REAUTH_REQUIRED', message: error.message });
      }
      if (error instanceof AccountGoneError) throw new UnauthorizedException();
      throw error;
    }
  }
}
