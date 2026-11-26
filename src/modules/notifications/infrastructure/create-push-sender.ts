import webpush from 'web-push';
import type { Env } from '../../../shared/config/env.validation';
import type { PushSender } from '../application/push-sender';
import { ConsolePushSender } from './console-push-sender';
import { WebPushSender } from './web-push-sender';

type PushConfig = Pick<
  Env,
  'PUSH_PROVIDER' | 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'
>;

// ADR-044: «console» (por defecto) no envía nada; «webpush» firma con las claves VAPID y envía de
// verdad. El arranque ya comprobó que las tres claves existen cuando se elige webpush.
export function createPushSender(config: PushConfig): PushSender {
  if (config.PUSH_PROVIDER !== 'webpush') return new ConsolePushSender();
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = config;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    throw new Error('PUSH_PROVIDER=webpush exige las tres variables VAPID');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return new WebPushSender((subscription, payload, options) =>
    webpush.sendNotification(subscription, payload, options),
  );
}
