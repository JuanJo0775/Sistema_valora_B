import type { Unit } from '../../../domain/unit-price';

// Grill de la #26, pregunta 3: un producto que propone un reportante, pendiente de moderación (RF-003 RN3).
export interface NewProductRequest {
  id: string;
  name: string;
  brand?: string;
  categoryCode: string;
  quantity: number;
  unit: Unit;
  packCount: number;
  barcode?: string;
  // Clave seudónima de quien lo propone (EC-08): nunca sale en respuestas.
  requesterKey: string;
  createdAt: Date;
}

export type ProductRequestDecision = 'aprobar' | 'fusionar' | 'rechazar';

export interface ProductRequestDecisionRecord {
  requestId: string;
  decision: ProductRequestDecision;
  // Solo con fusionar: el producto existente que ya representa a la propuesta.
  mergeInto?: string;
  note: string;
  moderatorKey: string;
  decidedAt: Date;
}

export interface ProductRequestRepository {
  save(request: NewProductRequest): Promise<void>;
  // Las pendientes, la más antigua primero.
  pending(): Promise<NewProductRequest[]>;
  // En la misma transacción: aprobar crea el producto (con el id de la propuesta) y su presentación;
  // fusionar agrega el nombre propuesto como alias y la presentación si es nueva.
  // false si la propuesta no existe o ya se decidió.
  decide(record: ProductRequestDecisionRecord): Promise<boolean>;
}

export const PRODUCT_REQUEST_REPOSITORY = Symbol('PRODUCT_REQUEST_REPOSITORY');
