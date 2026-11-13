import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { TooManyAttemptsError } from '../application/attempt-limiter';
import { RegisterAccount } from '../application/register-account';
import { RegisterDto } from './auth.dto';

// Lo que estas rutas leen de la petición, sin depender de los tipos de Express.
export interface ClientRequest {
  ip?: string;
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
  constructor(private readonly registerAccount: RegisterAccount) {}

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
}
