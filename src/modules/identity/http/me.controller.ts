import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
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
import { ChangeOwnDisplayName } from '../application/change-own-display-name';
import { ChangeOwnPassword } from '../application/change-own-password';
import { ReauthRequiredError } from '../application/recent-session';
import { ChangePasswordDto, ChangeProfileDto, DeleteAccountDto } from './auth.dto';
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

// Solo el nombre de la propia persona (EC-08): nunca sale en una respuesta pública.
export interface ProfileResponse {
  displayName: string;
}

@Controller('me')
export class MeController {
  constructor(
    private readonly deleteOwnAccount: DeleteOwnAccount,
    private readonly changeOwnPassword: ChangeOwnPassword,
    private readonly changeOwnDisplayName: ChangeOwnDisplayName,
  ) {}

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

  // ADR-033: cambia la contraseña (con la actual) o, en una cuenta de Google sin contraseña, crea la primera
  // (sesión de 10 minutos o menos). Cierra las OTRAS sesiones; la actual sigue.
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @AllowSuspended()
  async changePassword(
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: ChangePasswordDto,
    @Req() request: ClientRequest,
  ): Promise<void> {
    try {
      await this.changeOwnPassword.execute({
        accountId: session.accountId,
        sessionId: session.sessionId,
        sessionCreatedAt: session.createdAt,
        ip: request.ip ?? 'desconocida',
        ...(body.currentPassword === undefined ? {} : { currentPassword: body.currentPassword }),
        newPassword: body.newPassword,
      });
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
      if (error instanceof ReauthRequiredError) {
        throw new ForbiddenException({ code: 'REAUTH_REQUIRED', message: error.message });
      }
      if (error instanceof AccountGoneError) throw new UnauthorizedException();
      throw error;
    }
  }

  // Rectificación (Ley 1581): la persona cambia su nombre visible. Cualquier rol y también una cuenta
  // suspendida: es un dato propio y de bajo riesgo, y una sanción no quita el derecho a corregirlo. Exige
  // sesión y token CSRF (el guard cubre PATCH); sin contraseña. Un nombre igual al actual responde 200.
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @AllowSuspended()
  async changeProfile(
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: ChangeProfileDto,
  ): Promise<ProfileResponse> {
    try {
      const displayName = await this.changeOwnDisplayName.execute({
        accountId: session.accountId,
        displayName: body.displayName,
      });
      return { displayName };
    } catch (error) {
      if (error instanceof TooManyAttemptsError) {
        throw new HttpException(
          { retryAfterSeconds: error.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof AccountGoneError) throw new UnauthorizedException();
      throw error;
    }
  }
}
