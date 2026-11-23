import type { MerchantClaim } from './merchant-claims';
import { MerchantAlerts } from './merchant-alerts';
import type { OfficialPrice } from './official-prices';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-22T15:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const STORE = 'tienda-esperanza';

const merchant: MerchantClaim = {
  accountId: 'cuenta-de-dona-rosa',
  establishmentId: STORE,
  responsibleName: 'Rosa Gómez',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: daysAgo(30),
};
const price = (presentationId: string, confirmedDaysAgo: number): OfficialPrice => ({
  establishmentId: STORE,
  presentationId,
  priceCop: 4000,
  confirmedAt: daysAgo(confirmedDaysAgo),
});

// B9 (#209): avisos de vencimiento (D4) y de discrepancia corroborada (ADR-008).
describe('avisos para el comercio (GET /commerce/alerts)', () => {
  it('trae lo que vence mañana, lo vencido y las discrepancias, con el producto y el texto listo', async () => {
    const alerts = new MerchantAlerts({
      claims: { findByAccount: () => Promise.resolve(merchant) },
      // El arroz vence mañana (13 de 14 días), el aceite ya venció y la panela está al día.
      prices: {
        listFor: () =>
          Promise.resolve([price('arroz', 13), price('aceite', 15), price('panela', 2)]),
      },
      presentations: { isFresh: () => Promise.resolve(false) },
      labels: {
        labelsOf: () =>
          Promise.resolve(
            new Map([
              ['arroz', 'Arroz Diana · 500 g'],
              ['aceite', 'Aceite Gourmet · 1 l'],
              ['panela', 'Panela La Molienda · 500 g'],
            ]),
          ),
      },
      discrepancies: {
        of: () =>
          Promise.resolve([
            {
              presentationId: 'panela',
              officialPriceCop: 4000,
              reportedPriceCop: 4700,
              reports: 2,
              since: daysAgo(1),
            },
          ]),
      },
      clock: { now: () => now },
    });

    const result = await alerts.execute('cuenta-de-dona-rosa');

    expect(result).toEqual([
      {
        kind: 'vence_pronto',
        presentationId: 'arroz',
        productName: 'Arroz Diana · 500 g',
        // La última confirmación: un aviso por cada vez que el precio está por vencer.
        confirmedAt: daysAgo(13),
        message: 'Tu precio oficial de Arroz Diana · 500 g vence mañana: reconfírmalo.',
      },
      {
        kind: 'vencido',
        presentationId: 'aceite',
        productName: 'Aceite Gourmet · 1 l',
        confirmedAt: daysAgo(15),
        message:
          'Tu precio oficial de Aceite Gourmet · 1 l ya no está vigente: reconfírmalo para que vuelva a contar.',
      },
      {
        kind: 'discrepancia',
        presentationId: 'panela',
        productName: 'Panela La Molienda · 500 g',
        officialPriceCop: 4000,
        reportedPriceCop: 4700,
        reports: 2,
        since: daysAgo(1),
        message:
          'La comunidad reporta Panela La Molienda · 500 g a $4.700 y tu precio oficial es $4.000 (2 reportes).',
      },
    ]);
  });
});
