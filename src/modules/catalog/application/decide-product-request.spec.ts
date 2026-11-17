import { MixedUnitBasesError } from '../../../domain/unit-price';
import {
  DecideProductRequest,
  InvalidRequestNoteError,
  MergeProductNotFoundError,
  ProductRequestNotFoundError,
} from './decide-product-request';
import type { ProductView } from './product-repository';
import type { NewProductRequest, ProductRequestDecisionRecord } from './product-requests';
import { BarcodeTakenError } from './request-product';

const now = new Date('2026-11-15T12:00:00Z');
const note = 'Producto verificado en la tienda';
const request: NewProductRequest = {
  id: 'propuesta-1',
  name: 'Arroz de mesa',
  categoryCode: 'grains-groceries',
  quantity: 1,
  unit: 'kg',
  packCount: 1,
  requesterKey: 'clave-de-quien-propone',
  createdAt: new Date('2026-11-15T10:00:00Z'),
};
const rice: ProductView = {
  id: 'arroz',
  name: 'Arroz blanco',
  category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
  presentations: [{ id: 'p1', barcode: '7701234567897', quantity: 500, unit: 'g', packCount: 1 }],
};

function setup(pending: NewProductRequest[] = [request]) {
  const decided: ProductRequestDecisionRecord[] = [];
  const open = new Map(pending.map((item) => [item.id, item]));
  const decide = new DecideProductRequest({
    requests: {
      pending: () => Promise.resolve([...open.values()]),
      decide: (record) => {
        if (!open.delete(record.requestId)) return Promise.resolve(false);
        decided.push(record);
        return Promise.resolve(true);
      },
    },
    products: {
      findById: (id) => Promise.resolve(id === rice.id ? rice : null),
      findByBarcode: (barcode) => Promise.resolve(barcode === '7701234567897' ? [rice] : []),
    },
    clock: { now: () => now },
  });
  return { decided, decide };
}

const asModerator = { note, moderatorKey: 'moderadora' };

describe('decidir un producto propuesto (RF-003 RN3, grill de la #26)', () => {
  it.each(['aprobar', 'rechazar'] as const)(
    '%s queda registrado con motivo, moderador y hora',
    async (decision) => {
      const { decided, decide } = setup();

      await decide.execute({ requestId: 'propuesta-1', decision, ...asModerator });

      expect(decided).toEqual([
        { requestId: 'propuesta-1', decision, note, moderatorKey: 'moderadora', decidedAt: now },
      ]);
    },
  );

  it('fusionar exige un producto existente con la misma base de unidad (#59)', async () => {
    const { decided, decide } = setup([request, { ...request, id: 'propuesta-2', unit: 'l' }]);

    await expect(
      decide.execute({
        requestId: 'propuesta-1',
        decision: 'fusionar',
        mergeInto: 'no-existe',
        ...asModerator,
      }),
    ).rejects.toThrow(MergeProductNotFoundError);
    await expect(
      decide.execute({
        requestId: 'propuesta-2',
        decision: 'fusionar',
        mergeInto: rice.id,
        ...asModerator,
      }),
    ).rejects.toThrow(MixedUnitBasesError);
    await decide.execute({
      requestId: 'propuesta-1',
      decision: 'fusionar',
      mergeInto: rice.id,
      ...asModerator,
    });

    expect(decided).toMatchObject([{ requestId: 'propuesta-1', mergeInto: rice.id }]);
  });

  it('un código de barras que otro producto tomó mientras esperaba impide aprobarla', async () => {
    const { decided, decide } = setup([{ ...request, barcode: '7701234567897' }]);

    await expect(
      decide.execute({ requestId: 'propuesta-1', decision: 'aprobar', ...asModerator }),
    ).rejects.toThrow(BarcodeTakenError);
    await decide.execute({ requestId: 'propuesta-1', decision: 'rechazar', ...asModerator });

    expect(decided).toMatchObject([{ decision: 'rechazar' }]);
  });

  it('sin motivo de 10 caracteres no se decide; una propuesta ya decidida o inexistente no se encuentra', async () => {
    const { decide } = setup();

    await expect(
      decide.execute({
        requestId: 'propuesta-1',
        decision: 'aprobar',
        note: 'corto',
        moderatorKey: 'm',
      }),
    ).rejects.toThrow(InvalidRequestNoteError);
    await decide.execute({ requestId: 'propuesta-1', decision: 'aprobar', ...asModerator });
    await expect(
      decide.execute({ requestId: 'propuesta-1', decision: 'rechazar', ...asModerator }),
    ).rejects.toThrow(ProductRequestNotFoundError);
    await expect(
      decide.execute({ requestId: 'no-existe', decision: 'rechazar', ...asModerator }),
    ).rejects.toThrow(ProductRequestNotFoundError);
  });
});
