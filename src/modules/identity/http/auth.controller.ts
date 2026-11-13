import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { SESSION_MAX_DAYS } from '../../../domain/session-lifetime';
import { TooManyAttemptsError } from '../application/attempt-limiter';
import { InvalidCredentialsError, Login } from '../application/login';
import { RegisterAccount } from '../application/register-account';
import { LoginDto, RegisterDto } from './auth.dto';
import { sessionCookie } from './session-cookie';

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
  ) {}

  // Grill de la #16, pregunta 6: la misma respuesta exista o no el correo.
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto, @Req() request: ClientRequest): Promise<void> {
    try {
      await this.registerAccount.execute({
        email: body.email,
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
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logIn(
    @Body() body: LoginDto,
    @Req() request: ClientRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    try {
      const { token } = await this.login.execute({
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
      throw error;
    }
  }
}
