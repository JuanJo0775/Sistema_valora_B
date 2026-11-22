import { DecideStoreCorrection, StoreCorrectionNotFoundError } from './decide-store-correction';
import type { StoreCorrection, StoreCorrectionDecisionRecord } from './store-details';

const now = new Date('2026-11-23T12:00:00Z');
const note = 'Verificada con la foto de la fachada';

const correction: StoreCorrection = {
  id: 'correccion-1',
  establishmentId: 'tienda-esperanza',
  name: 'Tienda El Sol',
  location: { lat: 4.534, lng: -75.6812 },
  proposerKey: 'clave-de-dona-rosa',
  createdAt: new Date('2026-11-22T15:00:00Z'),
};

function setup() {
  const pending = new Map([[correction.id, correction]]);
  const decided: StoreCorrectionDecisionRecord[] = [];
  const decide = new DecideStoreCorrection({
    corrections: {
      decide: (record) => {
        const found = pending.get(record.correctionId);
        if (!found) return Promise.resolve(null);
        pending.delete(record.correctionId);
        decided.push(record);
        return Promise.resolve(found);
      },
    },
    clock: { now: () => now },
  });
  return { decide, decided };
}

describe('decidir una corrección de tienda (D5 del grill comercial)', () => {
  it.each(['aprobar', 'rechazar'] as const)(
    '%s queda registrado con motivo, moderador y hora',
    async (decision) => {
      const { decide, decided } = setup();

      await decide.execute({
        correctionId: 'correccion-1',
        decision,
        note,
        moderatorKey: 'moderadora',
      });

      expect(decided).toEqual([
        {
          correctionId: 'correccion-1',
          decision,
          note,
          moderatorKey: 'moderadora',
          decidedAt: now,
        },
      ]);
    },
  );

  it('una corrección que no existe o ya se decidió no se encuentra', async () => {
    const { decide } = setup();
    await decide.execute({
      correctionId: 'correccion-1',
      decision: 'aprobar',
      note,
      moderatorKey: 'moderadora',
    });

    await expect(
      decide.execute({
        correctionId: 'correccion-1',
        decision: 'rechazar',
        note,
        moderatorKey: 'moderadora',
      }),
    ).rejects.toThrow(StoreCorrectionNotFoundError);
  });
});
