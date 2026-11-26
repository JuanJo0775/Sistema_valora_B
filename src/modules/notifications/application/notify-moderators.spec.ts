import { contentOf } from './moderation-notice-content';
import { MIN_NOTICE_INTERVAL_MS, NotifyModerators } from './notify-moderators';
import type { NoticeLog } from './notice-log';
import { type PushDevice, type PushSender, PushUnavailableError } from './push-sender';

const device = (endpoint: string): PushDevice => ({
  endpoint: `https://push.example.net/${endpoint}`,
  p256dh: `clave-${endpoint}`,
  auth: `secreto-${endpoint}`,
});

class RecordingSender implements PushSender {
  readonly sent: { endpoint: string; body: string }[] = [];
  // Direcciones que el servicio de push ya no reconoce (404 o 410).
  readonly gone = new Set<string>();
  // Direcciones cuyo servicio de push no responde por ahora.
  readonly down = new Set<string>();

  send(target: PushDevice, content: { body: string }): Promise<'sent' | 'gone'> {
    if (this.down.has(target.endpoint)) return Promise.reject(new PushUnavailableError());
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

  // ADR-044: un fallo pasajero hace fallar el suscriptor para que el outbox reintente; como la
  // constancia solo se deja al enviar, el reintento no duplica el aviso a quien sí lo recibió.
  it('si el servicio de push no responde, falla para que se reintente y no deja constancia', async () => {
    const { notify, sender, log } = setup({
      'moderadora-1': [device('telefono-1')],
      'moderadora-2': [device('telefono-2')],
    });
    sender.down.add(device('telefono-1').endpoint);

    await expect(notify.execute('precios')).rejects.toBeInstanceOf(PushUnavailableError);

    expect(await log.lastSent('moderadora-1', 'precios')).toBeNull();
    // A la otra moderadora sí le llegó, y queda constancia.
    expect(await log.lastSent('moderadora-2', 'precios')).toEqual(NOW);

    sender.down.clear();
    await notify.execute('precios');

    expect(sender.sent.map(({ endpoint }) => endpoint)).toEqual([
      device('telefono-2').endpoint,
      device('telefono-1').endpoint,
    ]);
  });

  // Pruebas de resguardo: ya pasan con las reglas hechas.
  it('una moderadora sin dispositivos no recibe nada ni deja constancia', async () => {
    const { notify, sender, log } = setup({ 'moderadora-1': [] });

    await notify.execute('precios');

    expect(sender.sent).toHaveLength(0);
    expect(await log.lastSent('moderadora-1', 'precios')).toBeNull();
  });

  it('si un dispositivo falla pero otro de la misma cuenta recibe el aviso, no se reintenta', async () => {
    const { notify, sender, log } = setup({
      'moderadora-1': [device('apagado'), device('telefono-1')],
    });
    sender.down.add(device('apagado').endpoint);

    await expect(notify.execute('precios')).resolves.toBeUndefined();

    expect(sender.sent.map(({ endpoint }) => endpoint)).toEqual([device('telefono-1').endpoint]);
    expect(await log.lastSent('moderadora-1', 'precios')).toEqual(NOW);
  });
});
