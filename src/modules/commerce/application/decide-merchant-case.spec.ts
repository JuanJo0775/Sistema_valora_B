import type { DomainEvent } from '../../../shared/events';
import {
  DecideMerchantCase,
  MerchantCaseNotFoundError,
  type MerchantCaseDecisionRequest,
} from './decide-merchant-case';
import type {
  MerchantCase,
  MerchantCaseDecisionRecord,
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

function setup() {
  const revocations: { revocation: MerchantRevocation; events: DomainEvent[] }[] = [];
  const closed: MerchantCaseDecisionRecord[] = [];
  const decide = new DecideMerchantCase({
    cases: {
      findPending: (id) => Promise.resolve(id === report.id ? report : null),
      close: (record) => {
        closed.push(record);
        return Promise.resolve();
      },
    },
    claims: { findByEstablishment: () => Promise.resolve(owner) },
    prices: { listFor: () => Promise.resolve([price('arroz'), price('aceite')]) },
    promotions: { listFor: () => Promise.resolve([promotion]) },
    revocations: {
      revoke: (revocation, events) => {
        revocations.push({ revocation, events });
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { decide, revocations, closed };
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
});
