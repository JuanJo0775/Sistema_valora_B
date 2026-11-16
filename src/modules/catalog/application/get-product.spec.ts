import { GetProduct, ProductNotFoundError } from './get-product';
import type { ProductRepository, ProductView } from './product-repository';

const rice: ProductView = {
  id: '3f1c2a64-5c1e-4b8a-9d61-0a7b1f2e3c4d',
  name: 'Arroz blanco',
  brand: 'Diana',
  category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
  presentations: [
    {
      id: '9a2e7c10-1b2d-4e3f-8a9b-0c1d2e3f4a5b',
      barcode: '7702511000014',
      quantity: 1,
      unit: 'kg',
      packCount: 1,
    },
  ],
};

// Repositorio en memoria: doble del puerto, sin base de datos.
class InMemoryProductRepository implements ProductRepository {
  constructor(private readonly products: ProductView[]) {}

  findById(id: string): Promise<ProductView | null> {
    return Promise.resolve(this.products.find((product) => product.id === id) ?? null);
  }

  listCategories(): Promise<never> {
    return Promise.reject(new Error('GetProduct no lista categorías'));
  }

  search(): Promise<ProductView[]> {
    return Promise.reject(new Error('GetProduct no busca productos'));
  }

  findByBarcode(): Promise<ProductView[]> {
    return Promise.reject(new Error('GetProduct no busca por código de barras'));
  }

  presentationExists(): Promise<boolean> {
    return Promise.reject(new Error('GetProduct no comprueba presentaciones'));
  }

  findForComparison(): Promise<null> {
    return Promise.reject(new Error('GetProduct no consulta para la comparación'));
  }

  isFreshPresentation(): Promise<null> {
    return Promise.reject(new Error('GetProduct no consulta la frescura'));
  }

  labelsOf(): Promise<Map<string, string>> {
    return Promise.reject(new Error('GetProduct no consulta nombres'));
  }

  pricingOf(): Promise<Map<string, never>> {
    return Promise.reject(new Error('GetProduct no consulta presentaciones para precios'));
  }
}

describe('consultar un producto del catálogo', () => {
  it('devuelve el producto con su categoría y sus presentaciones', async () => {
    const getProduct = new GetProduct(new InMemoryProductRepository([rice]));

    await expect(getProduct.execute(rice.id)).resolves.toEqual(rice);
  });

  it('un producto que no existe en el catálogo lanza ProductNotFoundError', async () => {
    const getProduct = new GetProduct(new InMemoryProductRepository([rice]));
    const missingId = '00000000-0000-4000-8000-000000000000';

    await expect(getProduct.execute(missingId)).rejects.toThrow(ProductNotFoundError);
  });
});
