import { contentOf } from './moderation-notice-content';
import { NotifyModerators } from './notify-moderators';
import type { NoticeLog } from './notice-log';
import { type PushDevice, type PushSender } from './push-sender';

const device = (endpoint: string): PushDevice => ({
  endpoint: `https://push.example.net/${endpoint}`,
  p256dh: `clave-${endpoint}`,
  auth: `secreto-${endpoint}`,
});

class RecordingSender implements PushSender {
  readonly sent: { endpoint: string; body: string }[] = [];

  send(target: PushDevice, content: { body: string }): Promise<'sent' | 'gone'> {
    this.sent.push({ endpoint: target.endpoint, body: content.body });
    return Promise.resolve('sent');
  }
}

class InMemoryNoticeLog implements NoticeLog {
  readonly rows = new Map<string, Date>();

  lastSent(accountId: string, queue: string): Promise<Date | null> {
    return Promise.resolve(this.rows.get(`${accountId}/${queue}`) ?? null);
  }

  record(accountId: string, queue: string, at: Date): Promise<void> {
    this.rows.set(`${accountId}/${queue}`, at);
    return Promise.resolve();
  }
}

const NOW = new Date('2026-11-25T20:00:00Z');

function setup(devicesByAccount: Record<string, PushDevice[]>) {
  const sender = new RecordingSender();
  const log = new InMemoryNoticeLog();
  const removed: string[] = [];
  const notify = new NotifyModerators({
    moderators: { ids: () => Promise.resolve(Object.keys(devicesByAccount)) },
    subscriptions: {
      devicesOf: (accountId) => Promise.resolve(devicesByAccount[accountId] ?? []),
      remove: (_accountId, endpoints) => {
        removed.push(...endpoints);
        return Promise.resolve();
      },
    },
    sender,
    log,
    clock: { now: () => NOW },
  });
  return { notify, sender, log, removed };
}

// #260, ADR-044: avisar a los moderadores cuando entra un caso a una cola.
describe('avisar a los moderadores (ADR-044)', () => {
  it('manda el aviso a cada dispositivo de cada moderador y deja constancia', async () => {
    const { notify, sender, log } = setup({
      'moderadora-1': [device('telefono-1'), device('computador-1')],
      'moderadora-2': [device('telefono-2')],
    });

    await notify.execute('precios');

    expect(sender.sent.map(({ endpoint }) => endpoint).sort()).toEqual([
      device('computador-1').endpoint,
      device('telefono-1').endpoint,
      device('telefono-2').endpoint,
    ]);
    expect(sender.sent.every(({ body }) => body === contentOf('precios').body)).toBe(true);
    expect(await log.lastSent('moderadora-1', 'precios')).toEqual(NOW);
    expect(await log.lastSent('moderadora-2', 'precios')).toEqual(NOW);
  });
});
