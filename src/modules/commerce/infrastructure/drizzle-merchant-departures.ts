import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type { MerchantDeparture, MerchantDepartures } from '../application/merchant-departures';
import { withdrawPublished } from './drizzle-merchant-revocations';
import { disputeChallengers, merchantCases, merchantClaims, merchantNotices } from './schema';

const CASE_NOTES = {
  dejada: 'El comercio dejó la tienda por decisión propia.',
  eliminada: 'El comercio eliminó la tienda.',
} as const;

export class DrizzleMerchantDepartures implements MerchantDepartures {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  // H36 (ADR-040): todo junto o nada (ADR-015).
  async depart(departure: MerchantDeparture, events: DomainEvent[]): Promise<boolean> {
    const { accountId, establishmentId, kind, departedAt } = departure;
    return this.db.transaction(async (tx) => {
      // Dos llamadas a la vez: solo la que borra la solicitud publica los eventos.
      const removed = await tx
        .delete(merchantClaims)
        .where(
          and(
            eq(merchantClaims.accountId, accountId),
            eq(merchantClaims.establishmentId, establishmentId),
          ),
        )
        .returning({ accountId: merchantClaims.accountId });
      if (removed.length === 0) return false;
      // Los avisos ya enviados eran de esa tienda.
      await tx.delete(merchantNotices).where(eq(merchantNotices.accountId, accountId));
      await withdrawPublished(tx, this.outbox, establishmentId);
      // Sin dueño no queda nada que revocar: los casos abiertos se cierran sin moderador.
      await tx
        .update(merchantCases)
        .set({ status: 'descartado', note: CASE_NOTES[kind], decidedAt: departedAt })
        .where(
          and(
            eq(merchantCases.establishmentId, establishmentId),
            eq(merchantCases.status, 'pendiente'),
          ),
        );
      // H18: los datos de quien disputaba solo viven mientras su caso está pendiente.
      await tx
        .delete(disputeChallengers)
        .where(eq(disputeChallengers.establishmentId, establishmentId));
      for (const event of events) await this.outbox.publish(tx, event);
      return true;
    });
  }
}
