import type { DomainEvent } from '../../../shared/events';
import type { MerchantRevocation } from './merchant-cases';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPrice } from './official-prices';
import { MerchantNotVerifiedError, RevokeMerchant } from './revoke-merchant';

const now = new Date('2026-11-25T12:00:00Z');
const STORE = 'tienda-esperanza';
const note = 'Confirmado por teléfono: la tienda cerró.';

const claim: MerchantClaim = {
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
const price = (presentationId: string): OfficialPrice => ({
  establishmentId: STORE,
  presentationId,
  priceCop: 2600,
  confirmedAt: new Date('2026-11-22T15:00:00Z'),
});

function setup(found: MerchantClaim | null = claim) {
  const revocations: { revocation: MerchantRevocation; events: DomainEvent[] }[] = [];
  const revoke = new RevokeMerchant({
    claims: { findByEstablishment: () => Promise.resolve(found) },
    prices: { listFor: () => Promise.resolve([price('arroz'), price('aceite')]) },
    promotions: { listFor: () => Promise.resolve([]) },
    revocations: {
      revoke: (revocation, events) => {
        revocations.push({ revocation, events });
        return Promise.resolve();
      },
    },
    clock: { now: () => now },
  });
  return { revoke, revocations };
}

// H14: moderación revoca un comercio por iniciativa propia, sin esperar una denuncia ni una disputa.
describe('revocar un comercio por iniciativa de moderación (H14)', () => {
  it('revoca al comercio verificado con el motivo del moderador y retira lo que publicó', async () => {
    const { revoke, revocations } = setup();

    await revoke.execute({ establishmentId: STORE, note, moderatorKey: 'clave-del-moderador' });

    expect(revocations).toHaveLength(1);
    expect(revocations[0]?.revocation).toEqual({
      accountId: 'cuenta-del-dueno',
      establishmentId: STORE,
      reason: note,
      moderatorKey: 'clave-del-moderador',
      revokedAt: now,
    });
    expect(revocations[0]?.events.map((event) => event.type).sort()).toEqual([
      'MerchantRevoked',
      'OfficialPriceWithdrawn',
      'OfficialPriceWithdrawn',
    ]);
  });

  it('una tienda sin comercio verificado no se puede revocar', async () => {
    const { revoke, revocations } = setup(null);

    await expect(
      revoke.execute({ establishmentId: STORE, note, moderatorKey: 'clave-del-moderador' }),
    ).rejects.toBeInstanceOf(MerchantNotVerifiedError);
    expect(revocations).toEqual([]);
  });

  it('una solicitud solo preaprobada tampoco: se decide en la cola de tiendas', async () => {
    const { revoke, revocations } = setup({ ...claim, status: 'pre_aprobado', verifiedAt: null });

    await expect(
      revoke.execute({ establishmentId: STORE, note, moderatorKey: 'clave-del-moderador' }),
    ).rejects.toBeInstanceOf(MerchantNotVerifiedError);
    expect(revocations).toEqual([]);
  });
});
