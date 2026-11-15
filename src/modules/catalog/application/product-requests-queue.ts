import type { Unit } from '../../../domain/unit-price';
import type { ProductRepository } from './product-repository';
import type { ProductRequestRepository } from './product-requests';

export interface ProductRequestsQueuePorts {
  requests: Pick<ProductRequestRepository, 'pending'>;
  products: Pick<ProductRepository, 'search'>;
}

// Grill de la #26, pregunta 4: cuántos resultados de la búsqueda se sugieren como duplicados.
export const POSSIBLE_DUPLICATES_LIMIT = 5;

// Lo que el moderador necesita para decidir; nunca quién propuso (EC-08).
export interface ProductRequestItem {
  id: string;
  name: string;
  brand?: string;
  categoryCode: string;
  quantity: number;
  unit: Unit;
  packCount: number;
  barcode?: string;
  possibleDuplicates: { id: string; name: string }[];
  createdAt: Date;
}

// RF-003 RN3: los productos propuestos que esperan decisión, el más antiguo primero.
export class ProductRequestsQueue {
  constructor(private readonly ports: ProductRequestsQueuePorts) {}

  async list(): Promise<ProductRequestItem[]> {
    const pending = await this.ports.requests.pending();
    return Promise.all(
      pending.map(async ({ requesterKey: _requesterKey, ...request }) => {
        const text = [request.name, request.brand].filter(Boolean).join(' ');
        const similar = await this.ports.products.search({
          text,
          limit: POSSIBLE_DUPLICATES_LIMIT,
        });
        // Se sugiere, nunca se fusiona sola.
        return { ...request, possibleDuplicates: similar.map(({ id, name }) => ({ id, name })) };
      }),
    );
  }
}
