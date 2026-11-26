import { contentOf } from './moderation-notice-content';
import { MIN_NOTICE_INTERVAL_MS, NotifyModerators } from './notify-moderators';
import type { NoticeLog } from './notice-log';
import { type PushDevice, type PushSender } from './push-sender';

const device = (endpoint: string): PushDevice => ({
  endpoint: `https://push.example.net/${endpoint}`,
  p256dh: `clave-${endpoint}`,
  auth: `secreto-${endpoint}`,
});

class RecordingSender implements PushSender {
  readonly sent: { endpoint: string; body: string }[] = [];
  // Direcciones que el servicio de push ya no reconoce (404 o 410).
  readonly gone = new Set<string>();

  send(target: PushDevice, content: { body: string }): Promise<'sent' | 'gone'> {
    if (this.gone.has(target.endpoint)) return Promise.resolve('gone');
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

function setup(devicesByAccount: Record<string, PushDevice[]>, now: () => Date = () => NOW) {
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
    clock: { now },
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

  // Una racha de reportes no debe llenar el celular: un aviso por cola y cuenta cada 5 minutos.
  it('no vuelve a avisar a la misma cuenta por la misma cola antes de 5 minutos', async () => {
    let now = NOW;
    const { notify, sender } = setup({ 'moderadora-1': [device('telefono-1')] }, () => now);

    await notify.execute('precios');
    now = new Date(NOW.getTime() + MIN_NOTICE_INTERVAL_MS - 1000);
    await notify.execute('precios');

    expect(sender.sent).toHaveLength(1);
  });

  it('avisa de nuevo cuando pasaron los 5 minutos', async () => {
    let now = NOW;
    const { notify, sender } = setup({ 'moderadora-1': [device('telefono-1')] }, () => now);

    await notify.execute('precios');
    now = new Date(NOW.getTime() + MIN_NOTICE_INTERVAL_MS);
    await notify.execute('precios');

    expect(MIN_NOTICE_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(sender.sent).toHaveLength(2);
  });

  // ADR-045: un 404 o 410 del servicio de push quiere decir que la suscripción caducó.
  it('borra el dispositivo que el servicio de push ya no reconoce y sigue con los demás', async () => {
    const { notify, sender, removed, log } = setup({
      'moderadora-1': [device('caducado'), device('telefono-1')],
    });
    sender.gone.add(device('caducado').endpoint);

    await notify.execute('precios');

    expect(removed).toEqual([device('caducado').endpoint]);
    expect(sender.sent.map(({ endpoint }) => endpoint)).toEqual([device('telefono-1').endpoint]);
    expect(await log.lastSent('moderadora-1', 'precios')).toEqual(NOW);
  });
});
