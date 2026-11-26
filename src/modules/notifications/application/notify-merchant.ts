import { deliverNotice, type DeliveryPorts } from './deliver-notice';
import type { NoticeContent } from './moderation-notice-content';

export interface NotifyMerchantPorts extends DeliveryPorts {
  // Las cuentas con rol comercio que pueden recibir avisos (identity, solo ids).
  merchants: { ids(): Promise<string[]> };
}

// Cuenta del límite en el registro de avisos: es la «cola» del comercio.
const MERCHANT_QUEUE = 'comercio';

// ADR-044: lo que viaja es genérico, sin precios, productos ni nombres (EC-08).
const MERCHANT_CONTENT: NoticeContent = {
  title: 'Valora',
  body: 'Tienes avisos nuevos sobre tus precios',
  url: '/comercios',
  tag: 'comercio-avisos',
};

// ADR-044: a lo sumo un aviso al día por comercio (valor provisional, parametrizable), como el resumen
// diario por correo (D4).
export const MERCHANT_MIN_NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ADR-044: avisar al comercio de sus avisos nuevos (vencimiento y discrepancia).
export class NotifyMerchant {
  constructor(private readonly ports: NotifyMerchantPorts) {}

  // Devuelve cuántos avisos se enviaron.
  async execute(accountId: string): Promise<number> {
    // El evento puede llegar cuando la cuenta ya dejó la tienda o está suspendida o por eliminar.
    if (!(await this.ports.merchants.ids()).includes(accountId)) return 0;
    return deliverNotice(
      this.ports,
      [accountId],
      MERCHANT_QUEUE,
      MERCHANT_CONTENT,
      MERCHANT_MIN_NOTICE_INTERVAL_MS,
    );
  }
}
