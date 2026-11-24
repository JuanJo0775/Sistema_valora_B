import type { DomainEvent } from '../../../shared/events';
import { ApplyOfficialPriceReview } from './apply-official-price-review';
import type { OfficialPrice, OfficialPriceReview } from './official-prices';

const now = new Date('2026-11-25T10:00:00Z');
const STORE = 'tienda-esperanza';
const RICE = 'arroz-diana-500g';

const review: OfficialPriceReview = {
  reviewId: 'revision-1',
  establishmentId: STORE,
  presentationId: RICE,
  priceCop: 2600,
  submittedAt: new Date('2026-11-24T10:00:00Z'),
};

function setup(pending: OfficialPriceReview[] = [review]) {
  const prices: OfficialPrice[] = [];
  const events: DomainEvent[] = [];
  const apply = new ApplyOfficialPriceReview({
    prices: {
      takeReview: (establishmentId, presentationId, reviewId) => {
        const index = pending.findIndex(
          (r) =>
            r.establishmentId === establishmentId &&
            r.presentationId === presentationId &&
            r.reviewId === reviewId,
        );
        return Promise.resolve(index === -1 ? null : (pending.splice(index, 1)[0] ?? null));
      },
      save: (price, published) => {
        prices.push(price);
        events.push(...published);
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { apply, pending, prices, events };
}

const decided = (decision: 'aprobado' | 'descartado', reviewId = 'revision-1') => ({
  reviewId,
  establishmentId: STORE,
  presentationId: RICE,
  decision,
});

describe('decisión de moderación sobre un precio oficial en revisión (ADR-037)', () => {
  it('aprobar lo vuelve el oficial vigente, confirmado ahora, y avisa OfficialPricePublished', async () => {
    const { apply, pending, prices, events } = setup();

    await apply.execute(decided('aprobado'));

    const price = {
      establishmentId: STORE,
      presentationId: RICE,
      priceCop: 2600,
      confirmedAt: now,
    };
    expect(prices).toEqual([price]);
    expect(pending).toEqual([]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'OfficialPricePublished',
        payload: { ...price, confirmedAt: now.toISOString() },
      }),
    ]);
  });

  it('descartar lo retira sin publicar nada', async () => {
    const { apply, pending, prices, events } = setup();

    await apply.execute(decided('descartado'));

    expect(pending).toEqual([]);
    expect(prices).toEqual([]);
    expect(events).toEqual([]);
  });

  it('una decisión vieja (otro precio reemplazó la revisión) no hace nada', async () => {
    const { apply, pending, prices, events } = setup();

    await apply.execute(decided('aprobado', 'revision-anterior'));

    expect(pending).toEqual([review]);
    expect(prices).toEqual([]);
    expect(events).toEqual([]);
  });
});
