import type { ProductSearch, ProductView } from './product-repository';
import type { NewProductRequest } from './product-requests';
import { ProductRequestsQueue } from './product-requests-queue';

const request: NewProductRequest = {
  id: 'propuesta-1',
  name: 'Panela pulverizada',
  brand: 'La Molienda',
  categoryCode: 'grains-groceries',
  quantity: 500,
  unit: 'g',
  packCount: 1,
  requesterKey: 'clave-de-quien-propone',
  createdAt: new Date('2026-11-15T10:00:00Z'),
};
const found = (id: string, name: string): ProductView => ({
  id,
  name,
  category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
  presentations: [],
});

describe('productos propuestos pendientes (RF-003 RN3, grill de la #26)', () => {
  it('cada propuesta trae hasta 5 posibles duplicados de la búsqueda, sin datos de quien la hizo', async () => {
    const asked: ProductSearch[] = [];
    const queue = new ProductRequestsQueue({
      requests: { pending: () => Promise.resolve([request]) },
      products: {
        search: (query) => {
          asked.push(query);
          return Promise.resolve([found('producto-1', 'Panela La Molienda en polvo')]);
        },
      },
    });

    const items = await queue.list();

    expect(asked).toEqual([{ text: 'Panela pulverizada La Molienda', limit: 5 }]);
    expect(items).toEqual([
      {
        id: 'propuesta-1',
        name: 'Panela pulverizada',
        brand: 'La Molienda',
        categoryCode: 'grains-groceries',
        quantity: 500,
        unit: 'g',
        packCount: 1,
        possibleDuplicates: [{ id: 'producto-1', name: 'Panela La Molienda en polvo' }],
        createdAt: new Date('2026-11-15T10:00:00Z'),
      },
    ]);
    expect(JSON.stringify(items)).not.toContain('clave-de-quien-propone');
  });
});
