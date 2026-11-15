import type { ProductView } from './product-repository';
import type { NewProductRequest } from './product-requests';
import { BarcodeTakenError, RequestProduct, UnknownCategoryError } from './request-product';

const now = new Date('2026-11-15T10:00:00Z');
const existing: ProductView = {
  id: 'b2222222-2222-4222-8222-222222222222',
  name: 'Arroz blanco',
  category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
  presentations: [{ id: 'p1', barcode: '7701234567897', quantity: 500, unit: 'g', packCount: 1 }],
};

function setup(): { saved: NewProductRequest[]; request: RequestProduct } {
  const saved: NewProductRequest[] = [];
  const request = new RequestProduct({
    requests: {
      save: (proposal) => {
        saved.push(proposal);
        return Promise.resolve();
      },
    },
    products: {
      findByBarcode: (barcode) => Promise.resolve(barcode === '7701234567897' ? [existing] : []),
    },
    categories: { listCategoryCodes: () => Promise.resolve(['grains-groceries', 'beverages']) },
    clock: { now: () => now },
  });
  return { saved, request };
}

const proposal = {
  name: '  Panela pulverizada ',
  brand: ' La Molienda ',
  categoryCode: 'grains-groceries',
  quantity: 500,
  unit: 'g' as const,
  packCount: 1,
  requesterKey: 'clave-de-quien-propone',
};

describe('proponer un producto nuevo (RF-003 RN3, grill de la #26)', () => {
  it('queda pendiente con la clave seudónima de quien lo propone y la hora', async () => {
    const { saved, request } = setup();

    const result = await request.execute({ ...proposal, barcode: '7709876543210' });

    expect(result).toEqual({ id: saved[0]?.id, status: 'pendiente' });
    expect(saved).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        name: 'Panela pulverizada',
        brand: 'La Molienda',
        categoryCode: 'grains-groceries',
        quantity: 500,
        unit: 'g',
        packCount: 1,
        barcode: '7709876543210',
        requesterKey: 'clave-de-quien-propone',
        createdAt: now,
      },
    ]);
  });

  it('un código de barras que ya es de un producto se rechaza diciendo cuál', async () => {
    const { saved, request } = setup();

    const attempt = request.execute({ ...proposal, barcode: '7701234567897' });

    await expect(attempt).rejects.toThrow(BarcodeTakenError);
    await expect(attempt).rejects.toMatchObject({ productId: existing.id });
    expect(saved).toEqual([]);
  });

  it('una categoría que no existe se rechaza', async () => {
    const { saved, request } = setup();

    await expect(request.execute({ ...proposal, categoryCode: 'juguetes' })).rejects.toThrow(
      UnknownCategoryError,
    );
    expect(saved).toEqual([]);
  });
});
