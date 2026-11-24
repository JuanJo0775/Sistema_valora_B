import type { DomainEvent } from '../../../shared/events';
import {
  DecideMerchantCase,
  DecisionNotApplicableError,
  MerchantCaseNotFoundError,
  type MerchantCaseDecisionRequest,
} from './decide-merchant-case';
import type {
  MerchantCase,
  MerchantCaseDecisionRecord,
  MerchantClaimReview,
  MerchantRevocation,
} from './merchant-cases';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice } from './official-prices';
import type { Promotion } from './promotions';

const now = new Date('2026-11-23T12:00:00Z');
const STORE = 'tienda-esperanza';
const note = 'Confirmado con el dueño real: suplantación';

const owner: MerchantClaim = {
  accountId: 'cuenta-del-dueno',
  establishmentId: STORE,
  responsibleName: 'Rosa Gómez',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
};
const report: MerchantCase = {
  id: 'caso-1',
  establishmentId: STORE,
  kind: 'denuncia',
  reporterKey: 'clave-de-ana',
  reason: 'El dueño real es don Luis.',
  createdAt: new Date('2026-11-22T15:00:00Z'),
};
const price = (presentationId: string): OfficialPrice => ({
  establishmentId: STORE,
  presentationId,
  priceCop: 2600,
  confirmedAt: new Date('2026-11-22T15:00:00Z'),
});
const promotion: Promotion = {
  id: 'promo-1',
  establishmentId: STORE,
  presentationId: 'arroz',
  offer: { type: 'descuento_porcentual', percent: 10 },
  conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
  validFrom: '2026-11-22',
  validUntil: '2026-11-30',
  createdAt: new Date('2026-11-22T15:00:00Z'),
};

const pendingClaim: MerchantClaim = { ...owner, status: 'pre_aprobado', verifiedAt: null };
const claimCase: MerchantCase = {
  ...report,
  id: 'caso-reclamo',
  kind: 'reclamo',
  reason: 'Reclamo de un supermercado: pendiente de revisión.',
};

function setup(claim: MerchantClaim | null = owner, pending: MerchantCase[] = [report]) {
  const approvals: { review: MerchantClaimReview; events: DomainEvent[] }[] = [];
  const rejections: MerchantClaimReview[] = [];
  const revocations: { revocation: MerchantRevocation; events: DomainEvent[] }[] = [];
  const closed: MerchantCaseDecisionRecord[] = [];
  const decide = new DecideMerchantCase({
    cases: {
      findPending: (id) => Promise.resolve(pending.find((c) => c.id === id) ?? null),
      close: (record) => {
        closed.push(record);
        return Promise.resolve();
      },
    },
    claims: { findByEstablishment: () => Promise.resolve(claim) },
    prices: { listFor: () => Promise.resolve([price('arroz'), price('aceite')]) },
    promotions: { listFor: () => Promise.resolve([promotion]) },
    claimReviews: {
      approve: (review, events) => {
        approvals.push({ review, events });
        return Promise.resolve();
      },
      reject: (review) => {
        rejections.push(review);
        return Promise.resolve();
      },
    },
    revocations: {
      revoke: (revocation, events) => {
        revocations.push({ revocation, events });
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { decide, revocations, closed, approvals, rejections };
}

const request = (
  change: Partial<MerchantCaseDecisionRequest> = {},
): MerchantCaseDecisionRequest => ({
  caseId: 'caso-1',
  decision: 'revocar',
  note,
  moderatorKey: 'moderadora',
  ...change,
});

describe('decidir un caso de comercio (D3 del grill comercial)', () => {
  it('revocar retira el comercio, sus precios y sus promociones, y anota quién, cuándo y por qué', async () => {
    const { decide, revocations } = setup();

    await decide.execute(request());

    expect(revocations).toHaveLength(1);
    expect(revocations[0]?.revocation).toEqual({
      accountId: 'cuenta-del-dueno',
      establishmentId: STORE,
      reason: note,
      moderatorKey: 'moderadora',
      revokedAt: now,
    });
    expect(revocations[0]?.events.map((event) => [event.type, event.payload])).toEqual([
      ['MerchantRevoked', { accountId: 'cuenta-del-dueno', establishmentId: STORE }],
      ['OfficialPriceWithdrawn', { establishmentId: STORE, presentationId: 'arroz' }],
      ['OfficialPriceWithdrawn', { establishmentId: STORE, presentationId: 'aceite' }],
      ['PromotionWithdrawn', { id: 'promo-1', establishmentId: STORE, presentationId: 'arroz' }],
    ]);
  });

  it('descartar cierra el caso con su bitácora y no toca el comercio', async () => {
    const { decide, revocations, closed } = setup();

    await decide.execute(request({ decision: 'descartar' }));

    expect(revocations).toEqual([]);
    expect(closed).toEqual([
      { caseId: 'caso-1', status: 'descartado', note, moderatorKey: 'moderadora', decidedAt: now },
    ]);
  });

  it('un caso que no existe o ya se decidió no se encuentra', async () => {
    const { decide } = setup();

    await expect(decide.execute(request({ caseId: 'otro' }))).rejects.toThrow(
      MerchantCaseNotFoundError,
    );
  });

  it('revocar cuando el comercio ya no existe cierra el caso como descartado, sin dejarlo pendiente', async () => {
    const { decide, revocations, closed } = setup(null);

    await decide.execute(request());

    expect(revocations).toEqual([]);
    expect(closed).toEqual([
      { caseId: 'caso-1', status: 'descartado', note, moderatorKey: 'moderadora', decidedAt: now },
    ]);
  });

  describe('reclamo de un supermercado pre-aprobado (H11, ADR-037)', () => {
    const review = (change: Partial<MerchantCaseDecisionRequest> = {}) =>
      request({ caseId: 'caso-reclamo', decision: 'aprobar', ...change });

    it('aprobar verifica la solicitud, avisa MerchantVerified y anota quién, cuándo y por qué', async () => {
      const { decide, approvals, rejections, revocations } = setup(pendingClaim, [claimCase]);

      await decide.execute(review());

      expect(rejections).toEqual([]);
      expect(revocations).toEqual([]);
      expect(approvals).toHaveLength(1);
      expect(approvals[0]?.review).toEqual({
        caseId: 'caso-reclamo',
        accountId: 'cuenta-del-dueno',
        establishmentId: STORE,
        note,
        moderatorKey: 'moderadora',
        decidedAt: now,
      });
      expect(approvals[0]?.events.map((event) => [event.type, event.payload])).toEqual([
        ['MerchantVerified', { accountId: 'cuenta-del-dueno', establishmentId: STORE }],
      ]);
    });

    it('rechazar cierra la solicitud con el motivo, sin verificar y sin avisar al rol', async () => {
      const { decide, approvals, rejections } = setup(pendingClaim, [claimCase]);

      await decide.execute(review({ decision: 'rechazar' }));

      expect(approvals).toEqual([]);
      expect(rejections).toEqual([
        {
          caseId: 'caso-reclamo',
          accountId: 'cuenta-del-dueno',
          establishmentId: STORE,
          note,
          moderatorKey: 'moderadora',
          decidedAt: now,
        },
      ]);
    });

    it('si la solicitud ya no está pre-aprobada, el caso solo se cierra como descartado', async () => {
      for (const claim of [null, owner]) {
        const { decide, approvals, rejections, closed } = setup(claim, [claimCase]);

        await decide.execute(review());

        expect(approvals).toEqual([]);
        expect(rejections).toEqual([]);
        expect(closed).toEqual([
          {
            caseId: 'caso-reclamo',
            status: 'descartado',
            note,
            moderatorKey: 'moderadora',
            decidedAt: now,
          },
        ]);
      }
    });

    it.each(['revocar', 'descartar'] as const)('%s no aplica a un reclamo', async (decision) => {
      const { decide, closed, revocations } = setup(pendingClaim, [claimCase]);

      await expect(decide.execute(review({ decision }))).rejects.toThrow(
        DecisionNotApplicableError,
      );
      expect(closed).toEqual([]);
      expect(revocations).toEqual([]);
    });
  });

  it.each(['aprobar', 'rechazar'] as const)(
    '%s no aplica a una denuncia ni a una disputa',
    async (decision) => {
      const { decide, approvals, rejections } = setup();

      await expect(decide.execute(request({ decision }))).rejects.toThrow(
        DecisionNotApplicableError,
      );
      expect(approvals).toEqual([]);
      expect(rejections).toEqual([]);
    },
  );
});
