import { colombiaDate, COLOMBIA_OFFSET_MS } from '../../../domain/colombia-date';
import type { MerchantAlert } from './merchant-alerts';

export interface SendMerchantDigestsPorts {
  merchants: { verifiedAccounts(): Promise<string[]> };
  alerts: { execute(accountId: string): Promise<MerchantAlert[]> };
  // Lo ya avisado por correo a cada comercio, para no repetirlo.
  notices: {
    knownKeys(accountId: string): Promise<Set<string>>;
    sentOn(accountId: string, day: string): Promise<boolean>;
    record(accountId: string, day: string, keys: string[]): Promise<void>;
  };
  // La interfaz pública de identity: commerce nunca ve el correo (EC-08).
  notify: {
    send(accountId: string, notice: { subject: string; text: string }): Promise<boolean>;
  };
  clock: { now(): Date };
}

// Precisión de D4 (22-nov): el resumen sale desde esta hora de Colombia.
export const DIGEST_FROM_HOUR = 7;

// Un aviso se identifica por lo que lo causó: la confirmación que vence o la discrepancia corroborada.
export function alertKey(alert: MerchantAlert): string {
  return alert.kind === 'discrepancia'
    ? `discrepancia:${alert.presentationId}:${alert.since.toISOString()}:${String(alert.reportedPriceCop)}`
    : `${alert.kind}:${alert.presentationId}:${alert.confirmedAt.toISOString()}`;
}

const colombiaHour = (now: Date): number =>
  new Date(now.getTime() + COLOMBIA_OFFSET_MS).getUTCHours();

// B9 (#209) con las precisiones de D4: máximo un correo al día por comercio, desde las 7:00 a. m., y
// solo si hay un aviso que todavía no se le mandó. El correo trae todos sus avisos de hoy.
export class SendMerchantDigests {
  constructor(private readonly ports: SendMerchantDigestsPorts) {}

  async execute(): Promise<{ sent: number }> {
    const { merchants, alerts, notices, notify, clock } = this.ports;
    const now = clock.now();
    if (colombiaHour(now) < DIGEST_FROM_HOUR) return { sent: 0 };
    const day = colombiaDate(now);
    let sent = 0;
    for (const accountId of await merchants.verifiedAccounts()) {
      if (await notices.sentOn(accountId, day)) continue;
      const current = await alerts.execute(accountId);
      const known = await notices.knownKeys(accountId);
      const fresh = current.map(alertKey).filter((key) => !known.has(key));
      if (fresh.length === 0) continue;
      const delivered = await notify.send(accountId, {
        subject:
          fresh.length === 1
            ? 'Tienes 1 aviso nuevo en Valora'
            : `Tienes ${String(fresh.length)} avisos nuevos en Valora`,
        text: [
          'Estos son tus avisos de hoy en Valora:',
          '',
          ...current.map((alert) => `- ${alert.message}`),
          '',
          'Entra a Valora, en Comercios, para reconfirmar o corregir tus precios.',
        ].join('\n'),
      });
      if (!delivered) continue;
      await notices.record(accountId, day, fresh);
      sent += 1;
    }
    return { sent };
  }
}
