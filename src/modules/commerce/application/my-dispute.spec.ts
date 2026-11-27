import { MyDispute } from './my-dispute';

const openedAt = new Date('2026-11-24T15:00:00Z');

function setup(open: Record<string, { establishmentId: string; openedAt: Date }>) {
  return new MyDispute({
    cases: { openDisputeOf: (accountId) => Promise.resolve(open[accountId] ?? null) },
    establishments: {
      find: (id) => Promise.resolve(id === 'tienda-1' ? { name: 'Tienda La Esperanza' } : null),
    },
  });
}

// H17: quien disputa una tienda ve que su solicitud sigue abierta; hoy el formulario aparece vacío.
describe('mi disputa abierta (GET /commerce/me/dispute, H17)', () => {
  it('dice qué tienda disputa y desde cuándo', async () => {
    const result = await setup({ 'cuenta-juan': { establishmentId: 'tienda-1', openedAt } }).find(
      'cuenta-juan',
    );

    expect(result).toEqual({
      establishment: { id: 'tienda-1', name: 'Tienda La Esperanza' },
      requestedAt: openedAt,
    });
  });

  it('una cuenta sin disputa abierta recibe null', async () => {
    await expect(setup({}).find('cuenta-sin-disputa')).resolves.toBeNull();
  });

  it('no trae la cuenta ni datos del dueño de la tienda (EC-08)', async () => {
    const result = await setup({ 'cuenta-juan': { establishmentId: 'tienda-1', openedAt } }).find(
      'cuenta-juan',
    );

    expect(JSON.stringify(result)).not.toContain('cuenta-juan');
  });
});
