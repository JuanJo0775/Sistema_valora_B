import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Query,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseCookie } from 'cookie';
import { SESSION_MAX_DAYS } from '../../../domain/session-lifetime';
import type { Env } from '../../../shared/config/env.validation';
import { CLOCK, type Clock } from '../application/clock';
import {
  GOOGLE_HANDSHAKE_MINUTES,
  newGoogleHandshake,
  openHandshake,
  sealHandshake,
} from '../application/google-handshake';
import {
  GOOGLE_IDENTITY_PROVIDER,
  GoogleRejectedError,
  type GoogleIdentityProvider,
} from '../application/google-identity-provider';
import { type GoogleIdentity, SignInWithGoogle } from '../application/sign-in-with-google';
import type { CookieResponse } from './auth.controller';
import { GOOGLE_HANDSHAKE_COOKIE, googleCookie, sessionCookie } from './session-cookie';

// Lo que el callback lee de la petición, sin depender de los tipos de Express.
interface CallbackRequest {
  headers: { cookie?: string };
}

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

// Adónde vuelve la persona en la PWA (mismo origen: Vercel reenvía /v1/* a la API).
const SIGN_IN_PAGE = '/entrar';
const signInWithError = (code: string) => `${SIGN_IN_PAGE}?error=${code}`;

// ADR-029, fase 2 (#181): entrar con Google. La persona llega por el navegador (enlaces y
// redirecciones), no por fetch. Sin las tres variables de Google, las rutas responden 404.
@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    @Inject(GOOGLE_IDENTITY_PROVIDER) private readonly google: GoogleIdentityProvider | null,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
    private readonly signIn: SignInWithGoogle,
  ) {}

  @Get('start')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  start(@Res({ passthrough: true }) response: CookieResponse): { url: string } {
    const google = this.enabledGoogle();
    const handshake = newGoogleHandshake();
    const sealed = sealHandshake(handshake, this.secret(), this.clock.now());
    response.setHeader(
      'Set-Cookie',
      googleCookie(GOOGLE_HANDSHAKE_COOKIE, sealed, GOOGLE_HANDSHAKE_MINUTES * 60),
    );
    return { url: google.authorizationUrl(handshake) };
  }

  // Siempre redirige a la PWA y borra la cookie del saludo: sirve una sola vez.
  @Get('callback')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  async callback(
    @Query() query: CallbackQuery,
    @Req() request: CallbackRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<{ url: string }> {
    const google = this.enabledGoogle();
    response.setHeader('Set-Cookie', googleCookie(GOOGLE_HANDSHAKE_COOKIE, '', 0));
    // La persona canceló en Google: no es un error que mostrar.
    if (query.error) return { url: SIGN_IN_PAGE };
    const sealed = parseCookie(request.headers.cookie ?? '')[GOOGLE_HANDSHAKE_COOKIE];
    const handshake = sealed ? openHandshake(sealed, this.secret(), this.clock.now()) : null;
    if (!handshake || !query.code || query.state !== handshake.state) {
      return { url: signInWithError('google') };
    }
    let identity: GoogleIdentity;
    try {
      identity = await google.identityFrom(query.code, handshake);
    } catch (error) {
      if (error instanceof GoogleRejectedError) return { url: signInWithError('google') };
      throw error;
    }
    const result = await this.signIn.execute(identity);
    if (result.outcome === 'signed-in') {
      // Las dos cookies van juntas: la del saludo, vacía, y la de sesión, como POST /auth/login.
      response.setHeader('Set-Cookie', [
        googleCookie(GOOGLE_HANDSHAKE_COOKIE, '', 0),
        sessionCookie(result.token, SESSION_MAX_DAYS * 24 * 60 * 60),
      ]);
    }
    return { url: '/' };
  }

  private enabledGoogle(): GoogleIdentityProvider {
    if (!this.google) throw new NotFoundException();
    return this.google;
  }

  private secret(): string {
    return this.config.get('SESSION_SECRET', { infer: true });
  }
}
