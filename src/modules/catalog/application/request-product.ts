import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/domain-error';
import type { Unit } from '../../../domain/unit-price';
import type { ProductRepository } from './product-repository';
import type { ProductRequestRepository } from './product-requests';

export interface RequestProductPorts {
  requests: Pick<ProductRequestRepository, 'save'>;
  products: Pick<ProductRepository, 'findByBarcode'>;
  categories: { listCategoryCodes(): Promise<string[]> };
  clock: { now(): Date };
}

export interface ProductProposal {
  name: string;
  brand?: string;
  categoryCode: string;
  quantity: number;
  unit: Unit;
  packCount: number;
  barcode?: string;
  // Clave seudónima de quien propone (EC-08).
  requesterKey: string;
}

// RF-003 RN2: el código ya es de un producto; la capa HTTP lo traduce a 409 y dice cuál.
export class BarcodeTakenError extends Error {
  constructor(readonly productId: string) {
    super(`El código de barras ya es del producto ${productId}.`);
    this.name = 'BarcodeTakenError';
  }
}

// Grill de la #26, pregunta 3: la categoría sale de la lista cerrada (422).
export class UnknownCategoryError extends DomainError {
  readonly code = 'UNKNOWN_CATEGORY';

  constructor() {
    super('La categoría no existe.');
  }
}

// RF-003 RN3 (grill de la #26, pregunta 3): un reportante propone un producto; queda pendiente y no
// aparece en la búsqueda hasta que un moderador lo aprueba.
export class RequestProduct {
  constructor(private readonly ports: RequestProductPorts) {}

  async execute(proposal: ProductProposal): Promise<{ id: string; status: 'pendiente' }> {
    const { requests, products, categories, clock } = this.ports;
    if (!(await categories.listCategoryCodes()).includes(proposal.categoryCode)) {
      throw new UnknownCategoryError();
    }
    if (proposal.barcode) {
      const [owner] = await products.findByBarcode(proposal.barcode);
      if (owner) throw new BarcodeTakenError(owner.id);
    }
    const id = randomUUID();
    const brand = proposal.brand?.trim();
    await requests.save({
      id,
      name: proposal.name.trim(),
      ...(brand ? { brand } : {}),
      categoryCode: proposal.categoryCode,
      quantity: proposal.quantity,
      unit: proposal.unit,
      packCount: proposal.packCount,
      ...(proposal.barcode ? { barcode: proposal.barcode } : {}),
      requesterKey: proposal.requesterKey,
      createdAt: clock.now(),
    });
    return { id, status: 'pendiente' };
  }
}
