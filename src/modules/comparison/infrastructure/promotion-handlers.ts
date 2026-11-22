import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../shared/database/database.module';
import type { DomainEvent } from '../../../shared/events';
import type { PromotionCopy } from '../application/promotion-copies';
import { promotions } from './schema';

// Datos de PromotionPublished versión 1 (commerce, #206): la promoción y su fecha de creación.
type PromotionPublishedV1 = PromotionCopy & { createdAt: string };

// Datos de PromotionWithdrawn versión 1 (commerce, #206).
interface PromotionWithdrawnV1 {
  id: string;
}

export async function onPromotionPublished(event: DomainEvent, tx: Transaction): Promise<void> {
  const { createdAt: _createdAt, ...promotion } = event.payload as unknown as PromotionPublishedV1;
  await tx.insert(promotions).values(promotion).onConflictDoNothing();
}

export async function onPromotionWithdrawn(event: DomainEvent, tx: Transaction): Promise<void> {
  const { id } = event.payload as unknown as PromotionWithdrawnV1;
  await tx.delete(promotions).where(eq(promotions.id, id));
}
