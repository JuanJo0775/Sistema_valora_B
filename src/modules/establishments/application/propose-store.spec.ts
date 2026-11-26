import type { DomainEvent } from '../../../shared/events';
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

  // #260: moderación se entera de que hay una propuesta nueva por el outbox. El evento solo lleva el
  // id de la propuesta: nada de quien la propone (EC-08) y se guarda con ella, en la misma transacción.
  it('publica StoreProposed con el id de la propuesta, para avisar a moderación', async () => {
    const events: DomainEvent[][] = [];
    const propose = new ProposeStore({
      proposals: {
        save: (_proposal, published) => {
          events.push(published);
          return Promise.resolve();
        },
      },
      clock: { now: () => now },
    });

    const { id } = await propose.execute({
      name: 'Tienda Esperanza',
      type: 'barrio',
      lat: 4.5339,
      lng: -75.6811,
      municipality: 'armenia',
      proposerKey: 'clave-de-quien-propone',
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual([
      expect.objectContaining({ type: 'StoreProposed', version: 1, payload: { proposalId: id } }),
    ]);
    expect(JSON.stringify(events)).not.toContain('clave-de-quien-propone');
  });
});
