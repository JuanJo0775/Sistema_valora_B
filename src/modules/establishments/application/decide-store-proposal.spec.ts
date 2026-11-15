import {
  DecideStoreProposal,
  InvalidProposalNoteError,
  MergeTargetNotFoundError,
  StoreProposalNotFoundError,
} from './decide-store-proposal';
import type { StoreProposalDecisionRecord } from './store-proposals';

const now = new Date('2026-11-15T12:00:00Z');
const note = 'Tienda verificada en el sitio';

function setup(pendingIds: string[] = ['propuesta-1'], existingStores: string[] = ['tienda-1']) {
  const decided: StoreProposalDecisionRecord[] = [];
  const pending = new Set(pendingIds);
  const decide = new DecideStoreProposal({
    proposals: {
      decide: (record) => {
        if (!pending.has(record.proposalId)) return Promise.resolve(false);
        pending.delete(record.proposalId);
        decided.push(record);
        return Promise.resolve(true);
      },
    },
    stores: { exists: (id) => Promise.resolve(existingStores.includes(id)) },
    clock: { now: () => now },
  });
  return { decided, decide };
}

describe('decidir una tienda propuesta (RF-005 RN3 y RN7, grill de la #27)', () => {
  it.each(['aprobar', 'rechazar'] as const)(
    '%s queda registrado con motivo, moderador y hora',
    async (decision) => {
      const { decided, decide } = setup();

      await decide.execute({
        proposalId: 'propuesta-1',
        decision,
        note,
        moderatorKey: 'moderadora',
      });

      expect(decided).toEqual([
        { proposalId: 'propuesta-1', decision, note, moderatorKey: 'moderadora', decidedAt: now },
      ]);
    },
  );

  it('fusionar exige una tienda existente', async () => {
    const { decided, decide } = setup();

    await expect(
      decide.execute({
        proposalId: 'propuesta-1',
        decision: 'fusionar',
        mergeInto: 'no-existe',
        note,
        moderatorKey: 'moderadora',
      }),
    ).rejects.toThrow(MergeTargetNotFoundError);
    await decide.execute({
      proposalId: 'propuesta-1',
      decision: 'fusionar',
      mergeInto: 'tienda-1',
      note,
      moderatorKey: 'moderadora',
    });

    expect(decided).toMatchObject([{ decision: 'fusionar', mergeInto: 'tienda-1' }]);
  });

  it('sin motivo de 10 caracteres no se decide; una propuesta ya decidida o inexistente no se encuentra', async () => {
    const { decide } = setup();

    await expect(
      decide.execute({
        proposalId: 'propuesta-1',
        decision: 'aprobar',
        note: 'corto',
        moderatorKey: 'm',
      }),
    ).rejects.toThrow(InvalidProposalNoteError);
    await expect(
      decide.execute({ proposalId: 'no-existe', decision: 'aprobar', note, moderatorKey: 'm' }),
    ).rejects.toThrow(StoreProposalNotFoundError);
  });
});
