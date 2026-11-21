import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PurgeDeletedAccounts } from '../application/purge-deleted-accounts';

// Cada hora (ADR-032). Render gratuito duerme el servicio: por eso también hay una pasada al arrancar. La
// purga puede retrasarse unas horas si el servicio estuvo dormido, pero nunca se adelanta.
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class AccountPurgeScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(AccountPurgeScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(private readonly purge: PurgeDeletedAccounts) {}

  onApplicationBootstrap(): void {
    this.tick();
    this.timer = setInterval(() => {
      this.tick();
    }, PURGE_INTERVAL_MS);
    // El temporizador no debe mantener vivo el proceso.
    this.timer.unref();
  }

  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  // Una pasada a la vez; un fallo se registra (sin datos de cuentas) y se reintenta en la siguiente.
  private tick(): void {
    if (this.running) return;
    this.running = this.purge
      .execute()
      .then(({ purged, failed }) => {
        if (purged > 0 || failed > 0) {
          this.logger.log(
            `Cuentas eliminadas: ${String(purged)}; con error, para reintentar: ${String(failed)}.`,
          );
        }
      })
      .catch((error: unknown) => {
        this.logger.error(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        this.running = undefined;
      });
  }
}
