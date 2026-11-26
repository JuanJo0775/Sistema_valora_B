import { PurgeAccountSubscriptions } from './purge-account-subscriptions';

describe('borrar lo de una cuenta eliminada (ADR-032, ADR-045)', () => {
  it('borra todas las suscripciones de esa cuenta y de ninguna otra', async () => {
    const rows = [
      { accountId: 'cuenta-borrada', endpoint: 'https://push.example.net/telefono' },
      { accountId: 'cuenta-borrada', endpoint: 'https://push.example.net/computador' },
      { accountId: 'otra-cuenta', endpoint: 'https://push.example.net/tableta' },
    ];
    const purge = new PurgeAccountSubscriptions({
      subscriptions: {
        removeAll: (accountId) => {
          rows.splice(0, rows.length, ...rows.filter((row) => row.accountId !== accountId));
          return Promise.resolve();
        },
      },
      notices: { removeAll: () => Promise.resolve() },
    });

    await purge.execute('cuenta-borrada');

    expect(rows).toEqual([
      { accountId: 'otra-cuenta', endpoint: 'https://push.example.net/tableta' },
    ]);
  });

  // ADR-044: el registro de avisos guarda el id de la cuenta; al eliminarla no debe quedar nada.
  it('borra también el registro de avisos que se le enviaron', async () => {
    const removed: string[] = [];
    const purge = new PurgeAccountSubscriptions({
      subscriptions: { removeAll: () => Promise.resolve() },
      notices: {
        removeAll: (accountId) => {
          removed.push(accountId);
          return Promise.resolve();
        },
      },
    });

    await purge.execute('cuenta-borrada');

    expect(removed).toEqual(['cuenta-borrada']);
  });
});
