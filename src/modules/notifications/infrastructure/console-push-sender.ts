import { Logger } from '@nestjs/common';
import type { NoticeContent } from '../application/moderation-notice-content';
import type { PushDevice, PushResult, PushSender } from '../application/push-sender';

// PUSH_PROVIDER=console (desarrollo y pruebas): no se envía nada. Se deja una línea con la etiqueta
// del aviso; la dirección del dispositivo y sus claves nunca se escriben (ADR-045).
export class ConsolePushSender implements PushSender {
  private readonly logger = new Logger(ConsolePushSender.name);

  send(_device: PushDevice, content: NoticeContent): Promise<PushResult> {
    this.logger.log(`Aviso (no enviado, PUSH_PROVIDER=console): ${content.tag}`);
    return Promise.resolve('sent');
  }
}
