import { Controller, Get, Header, Inject, NotFoundException, Redirect, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.validation';
import type { Clock } from '../application/clock';
import { CLOCK } from '../application/clock';
import {
  GOOGLE_HANDSHAKE_MINUTES,
  newGoogleHandshake,
  sealHandshake,
} from '../application/google-handshake';
import {
  GOOGLE_IDENTITY_PROVIDER,
  type GoogleIdentityProvider,
} from '../application/google-identity-provider';
import type { CookieResponse } from './auth.controller';
import { GOOGLE_HANDSHAKE_COOKIE, googleCookie } from './session-cookie';

// ADR-029, fase 2 (#181): entrar con Google. La persona llega por el navegador (enlaces y
// redirecciones), no por fetch. Sin las tres variables de Google, las rutas responden 404.
@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    @Inject(GOOGLE_IDENTITY_PROVIDER) private readonly google: GoogleIdentityProvider | null,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
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

  private enabledGoogle(): GoogleIdentityProvider {
    if (!this.google) throw new NotFoundException();
    return this.google;
  }

  private secret(): string {
    return this.config.get('SESSION_SECRET', { infer: true });
  }
}
