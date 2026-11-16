import { ProposeStore } from './propose-store';
import type { NewStoreProposal } from './store-proposals';

const now = new Date('2026-11-15T10:00:00Z');

describe('proponer una tienda nueva (RF-005, grill de la #27)', () => {
  it('queda pendiente con la clave seudónima de quien la propone y la hora', async () => {
    const saved: NewStoreProposal[] = [];
    const propose = new ProposeStore({
      proposals: {
        save: (proposal) => {
          saved.push(proposal);
          return Promise.resolve();
        },
      },
      clock: { now: () => now },
    });

    const result = await propose.execute({
      name: '  Tienda Esperanza ',
      type: 'barrio',
      lat: 4.5339,
      lng: -75.6811,
      municipality: 'calarca',
      proposerKey: 'clave-de-quien-propone',
    });

    expect(result).toEqual({ id: saved[0]?.id, status: 'pendiente' });
    expect(saved).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        name: 'Tienda Esperanza',
        type: 'barrio',
        lat: 4.5339,
        lng: -75.6811,
        // Grill de la #106: el reportante dice en qué municipio está la tienda.
        municipality: 'calarca',
        proposerKey: 'clave-de-quien-propone',
        createdAt: now,
      },
    ]);
  });
});
