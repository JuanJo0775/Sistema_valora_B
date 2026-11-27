import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../shared/database/database.module';
import type { DomainEvent } from '../../../shared/events';
import { verifiedMerchants } from './schema';

// Datos de MerchantVerified, MerchantRevoked y MerchantLeft versión 1 (commerce). Solo se usa la
// tienda: la cuenta no entra al núcleo (EC-08).
interface MerchantEventV1 {
  establishmentId: string;
}

export async function onMerchantVerified(event: DomainEvent, tx: Transaction): Promise<void> {
  const { establishmentId } = event.payload as unknown as MerchantEventV1;
  await tx.insert(verifiedMerchants).values({ establishmentId }).onConflictDoNothing();
}

// Revocar y dejar la tienda la vuelven una tienda de la comunidad, sin comercio verificado.
export async function onMerchantGone(event: DomainEvent, tx: Transaction): Promise<void> {
  const { establishmentId } = event.payload as unknown as MerchantEventV1;
  await tx.delete(verifiedMerchants).where(eq(verifiedMerchants.establishmentId, establishmentId));
}
