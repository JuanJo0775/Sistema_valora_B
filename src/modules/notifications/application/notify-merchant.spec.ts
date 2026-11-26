import { MERCHANT_MIN_NOTICE_INTERVAL_MS, NotifyMerchant } from './notify-merchant';
import type { NoticeLog } from './notice-log';
import type { PushDevice, PushSender } from './push-sender';

const device = (name: string): PushDevice => ({
  endpoint: `https://push.example.net/${name}`,
  p256dh: `clave-${name}`,
  auth: `secreto-${name}`,
});

class RecordingSender implements PushSender {
  readonly sent: { endpoint: string; content: object }[] = [];

  send(target: PushDevice, content: object): Promise<'sent' | 'gone'> {
    this.sent.push({ endpoint: target.endpoint, content });
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

const NOW = new Date('2026-11-26T13:00:00Z');

function setup(
  devicesByAccount: Record<string, PushDevice[]>,
  merchants: string[] = Object.keys(devicesByAccount),
  now: () => Date = () => NOW,
) {
  const sender = new RecordingSender();
  const log = new InMemoryNoticeLog();
  const notify = new NotifyMerchant({
    merchants: { ids: () => Promise.resolve(merchants) },
    subscriptions: {
      devicesOf: (accountId) => Promise.resolve(devicesByAccount[accountId] ?? []),
      remove: () => Promise.resolve(),
    },
    sender,
    log,
    clock: { now },
  });
  return { notify, sender, log };
}

// #260, ADR-044: el comercio se entera de sus avisos (vencimiento y discrepancia) por push.
describe('avisar a un comercio (ADR-044)', () => {
  it('manda un texto genérico que lleva a Comercios a cada dispositivo del comercio', async () => {
    const { notify, sender, log } = setup({
      'cuenta-de-dona-rosa': [device('telefono'), device('computador')],
    });

    await expect(notify.execute('cuenta-de-dona-rosa')).resolves.toBe(2);

    expect(sender.sent.map(({ endpoint }) => endpoint).sort()).toEqual([
      device('computador').endpoint,
      device('telefono').endpoint,
    ]);
    // EC-08: nada del precio, de la tienda ni de los productos; solo que hay avisos.
    expect(sender.sent[0]?.content).toEqual({
      title: 'Valora',
      body: 'Tienes avisos nuevos sobre tus precios',
      url: '/comercios',
      tag: 'comercio-avisos',
    });
    expect(await log.lastSent('cuenta-de-dona-rosa', 'comercio')).toEqual(NOW);
  });

  // El resumen diario (D4) manda a lo sumo un correo al día; el aviso push sigue el mismo ritmo.
  it('no vuelve a avisar al mismo comercio antes de 24 horas', async () => {
    let now = NOW;
    const { notify, sender } = setup(
      { 'cuenta-de-dona-rosa': [device('telefono')] },
      undefined,
      () => now,
    );

    await notify.execute('cuenta-de-dona-rosa');
    now = new Date(NOW.getTime() + MERCHANT_MIN_NOTICE_INTERVAL_MS - 1000);
    await notify.execute('cuenta-de-dona-rosa');
    expect(sender.sent).toHaveLength(1);

    now = new Date(NOW.getTime() + MERCHANT_MIN_NOTICE_INTERVAL_MS);
    await notify.execute('cuenta-de-dona-rosa');

    expect(MERCHANT_MIN_NOTICE_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
    expect(sender.sent).toHaveLength(2);
  });

  // El evento puede llegar cuando la cuenta ya dejó la tienda o la suspendieron (ADR-045).
  it('una cuenta que ya no es comercio no recibe el aviso', async () => {
    const { notify, sender, log } = setup({ 'cuenta-que-se-fue': [device('telefono')] }, []);

    await expect(notify.execute('cuenta-que-se-fue')).resolves.toBe(0);

    expect(sender.sent).toEqual([]);
    expect(await log.lastSent('cuenta-que-se-fue', 'comercio')).toBeNull();
  });
});
