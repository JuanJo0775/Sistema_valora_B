import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CACHE_CATALOG } from '../../../shared/http/cache-control';
import { type AuthenticatedSession, CurrentSession, Roles, SessionGuard } from '../../identity';
import { SubscribePush } from '../application/subscribe-push';
import { UnsubscribePush } from '../application/unsubscribe-push';
import { SubscribeDto, UnsubscribeDto } from './subscribe.dto';

// La clave pública VAPID del servidor; undefined mientras no esté configurada.
export const VAPID_PUBLIC_KEY = Symbol('VAPID_PUBLIC_KEY');

// ADR-044 y ADR-045: avisos push a moderadores y comercios.
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly subscribePush: SubscribePush,
    private readonly unsubscribePush: UnsubscribePush,
    @Inject(VAPID_PUBLIC_KEY) private readonly publicKey: string | undefined,
  ) {}

  // Pública: la clave pública no es un secreto. La PWA la usa para pedir la suscripción al navegador.
  @Get('vapid-public-key')
  @Header('Cache-Control', CACHE_CATALOG)
  vapidPublicKey(): { publicKey: string } {
    // Sin clave configurada los avisos no existen: la PWA no muestra «Activar avisos».
    if (this.publicKey === undefined) throw new NotFoundException();
    return { publicKey: this.publicKey };
  }

  // Solo moderador y comercio (ADR-045). Nunca devuelve la dirección ni las claves (EC-08).
  @Post('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('moderador', 'comercio')
  async subscribe(
    @Body() body: SubscribeDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.subscribePush.execute({
      accountId: session.accountId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
  }

  // Idempotente: desactivar lo que no existe, o es de otra cuenta, responde 204 y no borra nada.
  @Delete('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('moderador', 'comercio')
  async unsubscribe(
    @Body() body: UnsubscribeDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.unsubscribePush.execute({ accountId: session.accountId, endpoint: body.endpoint });
  }
}
