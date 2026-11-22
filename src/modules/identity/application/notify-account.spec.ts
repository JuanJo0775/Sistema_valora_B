import type { EmailMessage } from './email-sender';
import { NotifyAccount } from './notify-account';

function setup(emails: Record<string, string>) {
  const sent: EmailMessage[] = [];
  const notify = new NotifyAccount({
    accounts: { verifiedEmailOf: (id) => Promise.resolve(emails[id] ?? null) },
    sender: {
      send: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    },
  });
  return { notify, sent };
}

const notice = { subject: 'Tus avisos de hoy en Valora', text: 'Tu precio oficial vence mañana.' };

// B9 (#209): commerce pide avisar a una cuenta y nunca ve su correo (EC-08, Ley 1581).
describe('avisar a una cuenta por correo', () => {
  it('envía el aviso al correo verificado de la cuenta', async () => {
    const { notify, sent } = setup({ 'cuenta-de-dona-rosa': 'rosa@correo.com' });

    await expect(notify.send('cuenta-de-dona-rosa', notice)).resolves.toBe(true);

    expect(sent).toEqual([{ to: 'rosa@correo.com', ...notice }]);
  });

  it('una cuenta sin correo verificado, o que ya no existe, no recibe nada', async () => {
    const { notify, sent } = setup({});

    await expect(notify.send('cuenta-borrada', notice)).resolves.toBe(false);

    expect(sent).toEqual([]);
  });
});
