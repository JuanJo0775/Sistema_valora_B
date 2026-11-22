import type { DomainEvent } from '../../../shared/events';

// RF-016 con la D4 del grill comercial: el precio que el comercio publica para su tienda. Vale lo
// mismo que un reporte (ADR-005), contando desde la última confirmación.
export interface OfficialPrice {
  establishmentId: string;
  presentationId: string;
  priceCop: number;
  confirmedAt: Date;
}

// Puerto hacia el esquema commerce.
export interface OfficialPriceRepository {
  // Uno por tienda y presentación: publicar otra vez lo reemplaza. Con sus eventos (ADR-015).
  save(price: OfficialPrice, events: DomainEvent[]): Promise<void>;
  // Los de la tienda, en el orden en que se publicaron.
  listFor(establishmentId: string): Promise<OfficialPrice[]>;
}

export const OFFICIAL_PRICE_PUBLISHED = 'OfficialPricePublished';
