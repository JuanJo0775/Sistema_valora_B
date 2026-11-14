import { and, eq } from 'drizzle-orm';
import { replacesCurrentPrice } from '../../../domain/current-price';
import type { Transaction } from '../../../shared/database/database.module';
import type { DomainEvent } from '../../../shared/events';
import { priceCurrent } from './schema';

// Datos de PriceAssessed versión 1 (grill de la #31, pregunta 4): el precio y el veredicto de
// reliability, sin la clave del reportante.
interface PriceAssessedV1 {
  reportId: string;
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  priceType: string;
  observedAt: string;
  receivedAt: string;
  verdict: 'normal' | 'sospechoso' | 'sin_datos';
}

// Suscriptor de PriceAssessed: deja en price_current el reporte observado más recientemente (ADR-004;
// grill de la #14, pregunta 7). Grill de la #31, pregunta 5: un sospechoso no reemplaza un precio;
// si no hay ninguno, entra «en revisión», y el siguiente precio no sospechoso lo reemplaza.
export async function onPriceAssessed(event: DomainEvent, tx: Transaction): Promise<void> {
  const payload = event.payload as unknown as PriceAssessedV1;
  const suspicious = payload.verdict === 'sospechoso';
  const candidate = {
    presentationId: payload.presentationId,
    establishmentId: payload.establishmentId,
    reportId: payload.reportId,
    priceCop: payload.priceCop,
    priceType: payload.priceType,
    observedAt: new Date(payload.observedAt),
    receivedAt: new Date(payload.receivedAt),
    status: suspicious ? 'en_revision' : 'vigente',
  };

  const inserted = await tx
    .insert(priceCurrent)
    .values(candidate)
    .onConflictDoNothing()
    .returning({ reportId: priceCurrent.reportId });
  if (inserted.length > 0 || suspicious) return;

  // Ya hay un precio: se bloquea la fila para que dos eventos simultáneos no se pisen.
  const samePlace = and(
    eq(priceCurrent.presentationId, candidate.presentationId),
    eq(priceCurrent.establishmentId, candidate.establishmentId),
  );
  const [current] = await tx.select().from(priceCurrent).where(samePlace).for('update');
  if (current && (current.status === 'en_revision' || replacesCurrentPrice(candidate, current))) {
    await tx.update(priceCurrent).set(candidate).where(samePlace);
  }
}
