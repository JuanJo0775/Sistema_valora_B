import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { SendMerchantDigests } from '../application/send-merchant-digests';

// B9 (#209): cada hora, como la purga de cuentas (ADR-032). Render gratuito duerme el servicio: por eso
// también hay una pasada al arrancar. El caso de uso decide si toca enviar (desde las 7:00 a. m.,
// máximo un correo al día por comercio).
export const DIGEST_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class MerchantDigestScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(MerchantDigestScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(private readonly digests: SendMerchantDigests) {}

  onApplicationBootstrap(): void {
    this.tick();
    this.timer = setInterval(() => {
      this.tick();
    }, DIGEST_INTERVAL_MS);
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
    this.running = this.digests
      .execute()
      .then(({ sent }) => {
        if (sent > 0) this.logger.log(`Resúmenes de avisos enviados: ${String(sent)}.`);
      })
      .catch(() => {
        this.logger.error('Falló el envío de los resúmenes de avisos; se reintenta en una hora.');
      })
      .finally(() => {
        this.running = undefined;
      });
  }
}
