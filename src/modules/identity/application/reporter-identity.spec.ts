import { ReporterIdentity } from './reporter-identity';

const anaId = '11111111-1111-4111-8111-111111111111';
const betoId = '22222222-2222-4222-8222-222222222222';
const createdAt = new Date('2026-11-10T15:30:00Z');

const identity = (secret = 'secreto-de-prueba', remembered = new Map<string, string>()) =>
  new ReporterIdentity({
    accounts: {
      createdAtOf: () => Promise.resolve(createdAt),
      rememberReporterKey: (accountId, reporterKey) => {
        remembered.set(accountId, reporterKey);
        return Promise.resolve();
      },
    },
    secret,
  });

describe('identidad seudónima del reportante (grill de la #31, pregunta 2)', () => {
  it('la misma cuenta da siempre la misma clave; otra cuenta u otro secreto dan otra, y la clave no contiene el id', async () => {
    const ana = await identity().of(anaId);

    expect(ana.reporterKey).toMatch(/^[0-9a-f]{64}$/);
    expect((await identity().of(anaId)).reporterKey).toBe(ana.reporterKey);
    expect((await identity().of(betoId)).reporterKey).not.toBe(ana.reporterKey);
    expect((await identity('otro-secreto').of(anaId)).reporterKey).not.toBe(ana.reporterKey);
    expect(ana.reporterKey).not.toContain(anaId.replaceAll('-', ''));
  });

  it('reporterSince es solo el día de creación de la cuenta', async () => {
    await expect(identity().of(anaId)).resolves.toMatchObject({ reporterSince: '2026-11-10' });
  });

  // Grill de la #33, pregunta 3: para suspender a quien reliability solo conoce por su clave.
  it('la clave queda guardada en la cuenta para poder encontrarla después', async () => {
    const remembered = new Map<string, string>();

    const ana = await identity('secreto-de-prueba', remembered).of(anaId);

    expect(remembered).toEqual(new Map([[anaId, ana.reporterKey]]));
  });
});
