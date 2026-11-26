import { deliverNotice, type DeliveryPorts } from './deliver-notice';
import { contentOf } from './moderation-notice-content';
import type { ModerationQueue } from './moderation-notice-rules';

export interface NotifyModeratorsPorts extends DeliveryPorts {
  // Las cuentas que pueden recibir avisos de moderación (identity, solo ids).
  moderators: { ids(): Promise<string[]> };
}

// ADR-044: como máximo un aviso por cola y por cuenta cada 5 minutos (valor provisional,
// parametrizable); el último queda en el registro de avisos.
export const MIN_NOTICE_INTERVAL_MS = 5 * 60 * 1000;

// ADR-044: avisar a los moderadores cuando entra un caso a una cola.
export class NotifyModerators {
  constructor(private readonly ports: NotifyModeratorsPorts) {}

  // Devuelve cuántos avisos se enviaron, para medir cuánto tarda desde el hecho (escenario EC-09).
  async execute(queue: ModerationQueue): Promise<number> {
    return deliverNotice(
      this.ports,
      await this.ports.moderators.ids(),
      queue,
      contentOf(queue),
      MIN_NOTICE_INTERVAL_MS,
    );
  }
}
