import { OwnDisplayName } from './own-display-name';

const names: Record<string, string | null> = { 'cuenta-ana': 'Ana María', 'cuenta-vieja': null };

const ownName = new OwnDisplayName({
  displayNames: { displayNameOf: (accountId) => Promise.resolve(names[accountId] ?? null) },
});

describe('el nombre visible de la propia cuenta', () => {
  it('devuelve el nombre con el que se registró la persona', async () => {
    await expect(ownName.execute('cuenta-ana')).resolves.toBe('Ana María');
  });

  it('una cuenta creada antes del nombre no tiene nombre', async () => {
    await expect(ownName.execute('cuenta-vieja')).resolves.toBeNull();
  });
});
