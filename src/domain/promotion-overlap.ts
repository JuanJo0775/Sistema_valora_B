import { DomainError } from './domain-error';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// «2026-11-23» se lee «23 de noviembre de 2026».
function readableDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${String(day)} de ${MONTHS[(month ?? 1) - 1] ?? ''} de ${String(year)}`;
}

export interface PromotionPeriod {
  // Fechas de Colombia (AAAA-MM-DD), las dos incluidas.
  validFrom: string;
  validUntil: string;
}

// H20: una presentación no puede tener dos promociones a la vez en la misma tienda (422).
export class PromotionOverlapError extends DomainError {
  readonly code = 'PROMOTION_OVERLAP';

  constructor(conflict: PromotionPeriod) {
    super(
      `Ya tienes una promoción vigente o programada para este producto del ${readableDate(conflict.validFrom)} al ${readableDate(conflict.validUntil)}. Retírala o cambia las fechas de la nueva para que no coincidan.`,
    );
  }
}

// Se solapan si comparten al menos un día. Las ya vencidas (su último día pasó) no cuentan; las
// retiradas se borran, así que no llegan aquí. Las fechas AAAA-MM-DD se comparan bien como texto.
export function findOverlap<T extends PromotionPeriod>(
  candidate: PromotionPeriod,
  others: T[],
  today: string,
): T | undefined {
  return others.find(
    (other) =>
      other.validUntil >= today &&
      other.validFrom <= candidate.validUntil &&
      candidate.validFrom <= other.validUntil,
  );
}
