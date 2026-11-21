import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { ConfigService } from '@nestjs/config';
import { SESSION_MAX_DAYS } from '../../../domain/session-lifetime';
import type { Env } from '../../../shared/config/env.validation';
import type { Role } from '../application/account-repository';
import { TooManyAttemptsError } from '../application/attempt-limiter';
import { csrfTokenFor } from '../application/csrf';
import { AccountPendingDeletionError, InvalidCredentialsError, Login } from '../application/login';
import { Logout } from '../application/logout';
import { OwnDisplayName } from '../application/own-display-name';
import { RegisterAccount } from '../application/register-account';
import { RestoreAccount } from '../application/restore-account';
import { ResendVerification } from '../application/resend-verification';
import { VerifyEmail } from '../application/verify-email';
import { LoginDto, RegisterDto, VerifyEmailDto } from './auth.dto';
import { clearedSessionCookie, sessionCookie } from './session-cookie';
import {
  AllowSuspended,
  type AuthenticatedSession,
  CurrentSession,
  SessionGuard,
} from './session.guard';

// Sin correo ni id de la cuenta (EC-08): el frontend solo necesita el rol.
export interface SessionResponse {
  role: Role;
  // #133: el nombre con el que la app saluda; solo en la propia sesión y si la cuenta lo tiene.
  displayName?: string;
  // ADR-029: si la cuenta ya verificó su correo; registrar precios lo exige. Solo en la propia sesión.
  emailVerified: boolean;
  // ADR-029: si el servidor exige la verificación (REQUIRE_VERIFIED_EMAIL). Con false no se pide al
  // usuario que verifique: la app no muestra el aviso.
  emailVerificationRequired: boolean;
  csrfToken: string;
  suspendedUntil?: string;
}

// Lo que estas rutas leen de la petición, sin depender de los tipos de Express.
export interface ClientRequest {
  ip?: string;
}

// Lo que estas rutas escriben en la respuesta.
export interface CookieResponse {
  setHeader(name: string, value: string): unknown;
}

// 429 con los segundos de espera: el filtro común los envía en Retry-After.
function tooManyRequests(error: TooManyAttemptsError): HttpException {
  return new HttpException(
    { retryAfterSeconds: error.retryAfterSeconds },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccount,
    private readonly login: Login,
    private readonly logout: Logout,
    private readonly restoreAccount: RestoreAccount,
    private readonly ownDisplayName: OwnDisplayName,
    private readonly verifyEmail: VerifyEmail,
    private readonly resendVerification: ResendVerification,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Grill de la #16, pregunta 6: la misma respuesta exista o no el correo.
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto, @Req() request: ClientRequest): Promise<void> {
    try {
      await this.registerAccount.execute({
        email: body.email,
        displayName: body.displayName,
        password: body.password,
        acceptedPolicyVersion: body.acceptedPolicyVersion,
        ip: request.ip ?? 'desconocida',
      });
    } catch (error) {
      if (error instanceof TooManyAttemptsError) throw tooManyRequests(error);
      throw error;
    }
  }

  // Grill de la #16, preguntas 3 y 9: sesión nueva en cada inicio, con la cookie de 30 días.
  // ADR-032: con la contraseña correcta de una cuenta pendiente de eliminación responde 403
  // ACCOUNT_PENDING_DELETION con la fecha, sin crear sesión.
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logIn(
    @Body() body: LoginDto,
    @Req() request: ClientRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.startSessionWith(this.login, body, request, response);
  }

  // ADR-032: cancela la eliminación pendiente y inicia la sesión como el login (misma respuesta y cookie).
  @Post('restore-account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(
    @Body() body: LoginDto,
    @Req() request: ClientRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.startSessionWith(this.restoreAccount, body, request, response);
  }

  private async startSessionWith(
    flow: Login | RestoreAccount,
    body: LoginDto,
    request: ClientRequest,
    response: CookieResponse,
  ): Promise<void> {
    try {
      const { token } = await flow.execute({
        email: body.email,
        password: body.password,
        ip: request.ip ?? 'desconocida',
      });
      // La cookie dura lo mismo que el máximo absoluto de la sesión (pregunta 9).
      response.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_DAYS * 24 * 60 * 60));
    } catch (error) {
      if (error instanceof TooManyAttemptsError) throw tooManyRequests(error);
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: error.message });
      }
      if (error instanceof AccountPendingDeletionError) {
        throw new ForbiddenException({
          code: 'ACCOUNT_PENDING_DELETION',
          message: error.message,
          scheduledFor: error.scheduledFor.toISOString(),
        });
      }
      throw error;
    }
  }

  // Grill de la #16, pregunta 4: el token CSRF se deriva de la sesión y no se guarda.
  // no-store: lleva el token CSRF de esta sesión; ninguna caché, ni la del CDN, puede guardarla (ADR-031).
  @Get('session')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @AllowSuspended()
  async session(@CurrentSession() session: AuthenticatedSession): Promise<SessionResponse> {
    const secret = this.config.get('SESSION_SECRET', { infer: true });
    const displayName = await this.ownDisplayName.execute(session.accountId);
    return {
      role: session.role,
      ...(displayName ? { displayName } : {}),
      emailVerified: session.emailVerified,
      emailVerificationRequired: this.config.get('REQUIRE_VERIFIED_EMAIL', { infer: true }),
      csrfToken: csrfTokenFor(session.token, secret),
      // Grill de la #71, pregunta 5: el frontend muestra que la sesión está limitada.
      ...(session.suspendedUntil ? { suspendedUntil: session.suspendedUntil.toISOString() } : {}),
    };
  }

  // ADR-029: POST y no GET, para que los antivirus y las vistas previas no gasten el enlace. Pública:
  // lleva el token, no la sesión. Un token inválido, vencido o usado responde igual (422).
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verify(@Body() body: VerifyEmailDto, @Req() request: ClientRequest): Promise<void> {
    try {
      await this.verifyEmail.execute({ token: body.token, ip: request.ip ?? 'desconocida' });
    } catch (error) {
      if (error instanceof TooManyAttemptsError) throw tooManyRequests(error);
      throw error;
    }
  }

  // ADR-029: reenvía el enlace a la cuenta de la SESIÓN (nunca a un correo recibido en el cuerpo), así
  // no revela qué correos existen. Responde 202 igual si la cuenta ya estaba verificada.
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SessionGuard)
  @AllowSuspended()
  async resend(@CurrentSession() session: AuthenticatedSession): Promise<void> {
    try {
      await this.resendVerification.execute({ accountId: session.accountId });
    } catch (error) {
      if (error instanceof TooManyAttemptsError) throw tooManyRequests(error);
      throw error;
    }
  }

  // Grill de la #16, pregunta 3: revoca la sesión en el servidor y borra la cookie. El guard exige
  // el token CSRF porque es un POST.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @AllowSuspended()
  async logOut(
    @CurrentSession() session: AuthenticatedSession,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.logout.execute(session.sessionId);
    response.setHeader('Set-Cookie', clearedSessionCookie());
  }
}
