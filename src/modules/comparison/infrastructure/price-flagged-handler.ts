import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../../shared/database/database.module';
import type { DomainEvent } from '../../../shared/events';
import { priceCurrent, priceHistory } from './schema';

// Datos de PriceFlagged versión 1 (EC-03, ADR-030): una cuenta marcó un reporte y entró a la cola de
// moderación; sin la clave de nadie.
interface PriceFlaggedV1 {
  reportId: string;
  presentationId: string;
  establishmentId: string;
}

// Solo actúa si el precio que se muestra es el marcado: un reporte que ya no es el vigente no cambia
// nada. Pasa a «en_revision» (no entra al orden ni al «Más barato»); si el moderador lo aprueba,
// PriceAssessed lo vuelve a «vigente»; si lo descarta, PriceWithdrawn lo retira.
export async function onPriceFlagged(event: DomainEvent, tx: Transaction): Promise<void> {
  const payload = event.payload as unknown as PriceFlaggedV1;
  await tx
    .update(priceCurrent)
    .set({ status: 'en_revision' })
    .where(
      and(
        eq(priceCurrent.presentationId, payload.presentationId),
        eq(priceCurrent.establishmentId, payload.establishmentId),
        eq(priceCurrent.reportId, payload.reportId),
      ),
    );
}

// Como un sospechoso, un reporte marcado no cuenta en el historial hasta que se apruebe.
export async function onPriceFlaggedForHistory(event: DomainEvent, tx: Transaction): Promise<void> {
  const payload = event.payload as unknown as PriceFlaggedV1;
  await tx
    .update(priceHistory)
    .set({ status: 'sospechoso' })
    .where(and(eq(priceHistory.reportId, payload.reportId), eq(priceHistory.status, 'cuenta')));
}
