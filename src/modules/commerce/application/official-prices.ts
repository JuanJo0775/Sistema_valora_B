import type { DomainEvent } from '../../../shared/events';

// RF-016 con la D4 del grill comercial: el precio que el comercio publica para su tienda. Vale lo
// mismo que un reporte (ADR-005), contando desde la última confirmación.
export interface OfficialPrice {
  establishmentId: string;
  presentationId: string;
  priceCop: number;
  confirmedAt: Date;
}

// ADR-037: un precio oficial sin referencia con qué compararlo (sin_datos) se acepta, pero no es
// oficial ni vigente hasta que un moderador lo apruebe. Una por tienda y presentación.
export interface OfficialPriceReview {
  reviewId: string;
  establishmentId: string;
  presentationId: string;
  priceCop: number;
  submittedAt: Date;
}

// Lo que el comercio recibe al publicar: «vigente» si ya es el oficial, «en_revision» si espera.
export type OfficialPriceStatus = 'vigente' | 'en_revision';

// Puerto hacia el esquema commerce.
export interface OfficialPriceRepository {
  // Uno por tienda y presentación: publicar otra vez lo reemplaza. Con sus eventos (ADR-015).
  // Publicar cierra la revisión pendiente de esa presentación, si la había.
  save(price: OfficialPrice, events: DomainEvent[]): Promise<void>;
  // D7: las filas buenas de un archivo, todas en una transacción con sus eventos. Con `reviews`
  // (ADR-037), las filas sin referencia, que quedan en revisión en la misma transacción.
  saveAll(
    prices: OfficialPrice[],
    events: DomainEvent[],
    reviews?: OfficialPriceReview[],
  ): Promise<void>;
  // ADR-037: deja el precio en revisión (reemplaza una revisión anterior de esa presentación).
  hold(review: OfficialPriceReview, events: DomainEvent[]): Promise<void>;
  // ADR-037: las revisiones pendientes de la tienda, en el orden en que se enviaron.
  listReviewsFor(establishmentId: string): Promise<OfficialPriceReview[]>;
  // ADR-037: quita y devuelve la revisión si sigue siendo esa; null si ya no (la reemplazó otro
  // precio o se retiró la tienda): una decisión vieja no hace nada.
  takeReview(
    establishmentId: string,
    presentationId: string,
    reviewId: string,
  ): Promise<OfficialPriceReview | null>;
  // El de una presentación en la tienda, o null (D6: la promoción lo exige).
  findOne(establishmentId: string, presentationId: string): Promise<OfficialPrice | null>;
  // Los de la tienda, en el orden en que se publicaron.
  listFor(establishmentId: string): Promise<OfficialPrice[]>;
  // Confirma todos los de la tienda a la vez, con sus eventos. Devuelve cuántos.
  reconfirmAll(establishmentId: string, at: Date, events: DomainEvent[]): Promise<number>;
}

export const OFFICIAL_PRICE_PUBLISHED = 'OfficialPricePublished';
// D4: un solo evento por toque, aunque la tienda tenga 1.000 precios.
export const OFFICIAL_PRICES_RECONFIRMED = 'OfficialPricesReconfirmed';

// ADR-037: commerce avisa a moderación que un precio oficial sin referencia espera decisión.
// v1: { reviewId, establishmentId, presentationId, priceCop, submittedAt, reporterKey }.
export const OFFICIAL_PRICE_HELD = 'OfficialPriceHeld';
// ADR-037: la revisión se cerró sin decisión (otro precio la reemplazó o se retiró la tienda).
export const OFFICIAL_PRICE_REVIEW_CLOSED = 'OfficialPriceReviewClosed';
// ADR-037: lo que moderación decidió (lo publica reliability; commerce lo escucha por su nombre).
export const OFFICIAL_PRICE_REVIEWED = 'OfficialPriceReviewed';
