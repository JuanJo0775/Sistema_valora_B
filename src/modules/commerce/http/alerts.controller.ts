import { Controller, ForbiddenException, Get, Header, UseGuards } from '@nestjs/common';
import { type AuthenticatedSession, CurrentSession, Roles, SessionGuard } from '../../identity';
import { type MerchantAlert, MerchantAlerts } from '../application/merchant-alerts';
import { MerchantNotVerifiedError } from '../application/publish-official-price';

type AlertResponse = Omit<MerchantAlert, 'confirmedAt' | 'since'> & {
  confirmedAt?: string;
  since?: string;
};

const toResponse = (alert: MerchantAlert): AlertResponse =>
  alert.kind === 'discrepancia'
    ? { ...alert, since: alert.since.toISOString() }
    : { ...alert, confirmedAt: alert.confirmedAt.toISOString() };

// B9 (#209): los avisos de vencimiento (D4) y de discrepancia (ADR-008) del comercio.
@Controller('commerce/alerts')
export class AlertsController {
  constructor(private readonly merchantAlerts: MerchantAlerts) {}

  // Dato de la propia cuenta: nunca en una caché compartida.
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(SessionGuard)
  @Roles('comercio')
  async list(@CurrentSession() session: AuthenticatedSession): Promise<{ items: AlertResponse[] }> {
    try {
      const alerts = await this.merchantAlerts.execute(session.accountId);
      return { items: alerts.map(toResponse) };
    } catch (error) {
      if (error instanceof MerchantNotVerifiedError) {
        throw new ForbiddenException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }
}
