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
  InvalidConfirmationError,
  InvalidPasswordError,
  LastModeratorError,
} from '../application/delete-own-account';
import { DeleteAccountDto } from './auth.dto';
import type { ClientRequest, CookieResponse } from './auth.controller';
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
        ip: request.ip ?? 'desconocida',
        ...(body.password === undefined
          ? { confirmEmail: body.confirmEmail ?? '' }
          : { password: body.password }),
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
      if (error instanceof InvalidConfirmationError) {
        throw new ForbiddenException({ code: 'INVALID_CONFIRMATION', message: error.message });
      }
      if (error instanceof LastModeratorError) {
        throw new ForbiddenException({
          code: 'LAST_MODERATOR_CANNOT_DELETE',
          message: error.message,
        });
      }
      if (error instanceof AccountGoneError) throw new UnauthorizedException();
      throw error;
    }
  }
}
