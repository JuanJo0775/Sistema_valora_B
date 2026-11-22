import type { StoreContact } from './store-details';

// Puerta de entrada pública (D5 del grill comercial, #207): la ficha de la tienda muestra el horario
// y el teléfono que puso el comercio. Datos del negocio, nunca de una persona (EC-08).
export class StoreContactOf {
  constructor(
    private readonly stores: { contactOf(establishmentId: string): Promise<StoreContact | null> },
  ) {}

  of(establishmentId: string): Promise<StoreContact | null> {
    return this.stores.contactOf(establishmentId);
  }
}
