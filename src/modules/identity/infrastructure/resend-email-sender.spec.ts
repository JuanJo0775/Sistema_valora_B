import { EmailSendError } from '../application/email-sender';
import { ResendEmailSender } from './resend-email-sender';

const apiKey = 're_clave-secreta-de-prueba';
const message = {
  to: 'ana@correo.com',
  subject: 'Verifica tu correo en Valora',
  text: 'Abre https://valora.example/verificar-correo?token=abc',
};

const sender = (fetchImpl: typeof fetch) =>
  new ResendEmailSender({ apiKey, from: 'Valora <no-responder@valora.example>', fetch: fetchImpl });

describe('enviar correo con Resend (ADR-029)', () => {
  it('hace POST a la API de Resend con la clave en Authorization y el mensaje en JSON', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = (url, init) => {
      calls.push({ url: url as string, init: init ?? {} });
      return Promise.resolve(new Response('{"id":"1"}', { status: 200 }));
    };

    await sender(fetchImpl).send(message);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.init.method).toBe('POST');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      from: 'Valora <no-responder@valora.example>',
      to: ['ana@correo.com'],
      subject: message.subject,
      text: message.text,
    });
  });

  it('si Resend rechaza el envío falla con el código HTTP, sin la clave ni el correo ni el cuerpo', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(`{"message":"API key ${apiKey} inválida para ana@correo.com"}`, {
          status: 403,
        }),
      );

    const attempt = sender(fetchImpl).send(message);

    await expect(attempt).rejects.toThrow(EmailSendError);
    await expect(attempt).rejects.toThrow('403');
    const error = (await attempt.catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(apiKey);
    expect(error.message).not.toContain('ana@correo.com');
  });

  it('si la red falla, el error tampoco revela la clave', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.reject(new Error(`connect ECONNREFUSED con ${apiKey}`));

    const error = (await sender(fetchImpl)
      .send(message)
      .catch((e: unknown) => e)) as Error;

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.message).not.toContain(apiKey);
    expect(error.cause).toBeUndefined();
  });
});
