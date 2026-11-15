import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../shared/database/database.module';
import type { DomainEvent } from '../../../shared/events';
import { priceHistory } from './schema';

// Lo que el historial usa de PriceAssessed v1 y de PriceWithdrawn v1 (contratos de la #31 y la #32).
interface PriceAssessedV1 {
  reportId: string;
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  observedAt: string;
  verdict: 'normal' | 'sospechoso' | 'sin_datos';
}

interface PriceWithdrawnV1 {
  reportId: string;
}

// Grill de la #83, preguntas 1 y 4: una fila por reporte. Un sospechoso no cuenta; si el moderador
// lo aprueba, llega otra vez como normal y la misma fila pasa a contar.
export async function onPriceAssessedForHistory(
  event: DomainEvent,
  tx: Transaction,
): Promise<void> {
  const payload = event.payload as unknown as PriceAssessedV1;
  const status = payload.verdict === 'sospechoso' ? 'sospechoso' : 'cuenta';
  await tx
    .insert(priceHistory)
    .values({
      reportId: payload.reportId,
      presentationId: payload.presentationId,
      establishmentId: payload.establishmentId,
      priceCop: payload.priceCop,
      observedAt: new Date(payload.observedAt),
      status,
    })
    .onConflictDoUpdate({ target: priceHistory.reportId, set: { status } });
}

// Un precio descartado por moderación sale del historial.
export async function onPriceWithdrawnForHistory(
  event: DomainEvent,
  tx: Transaction,
): Promise<void> {
  const payload = event.payload as unknown as PriceWithdrawnV1;
  await tx
    .update(priceHistory)
    .set({ status: 'retirado' })
    .where(eq(priceHistory.reportId, payload.reportId));
}
