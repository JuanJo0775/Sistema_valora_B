import { MixedUnitBasesError } from '../../../domain/unit-price';
import { ImportCatalog, type ProductImport, type ProductImportRepository } from './import-catalog';

const product = (units: ProductImport['presentations'][number]['unit'][]): ProductImport => ({
  id: 'producto-1',
  name: 'Arroz blanco',
  brand: 'Diana',
  categoryCode: 'grains-groceries',
  presentations: units.map((unit, index) => ({
    id: `presentacion-${String(index)}`,
    quantity: 1,
    unit,
    packCount: 1,
  })),
});

function setup() {
  const saved: ProductImport[] = [];
  const repository: ProductImportRepository = {
    save: (imported) => {
      saved.push(imported);
      return Promise.resolve();
    },
    listProductIds: () => Promise.resolve([]),
    listCategoryCodes: () => Promise.resolve([]),
  };
  return { saved, importCatalog: new ImportCatalog(repository, { save: () => Promise.resolve() }) };
}

describe('importar un producto al catálogo (issue #59)', () => {
  it('un producto con presentaciones en g y kg se guarda', async () => {
    const { saved, importCatalog } = setup();

    await importCatalog.save(product(['g', 'kg']));

    expect(saved).toHaveLength(1);
  });

  it('un producto que mezcla g y und se rechaza y no se guarda', async () => {
    const { saved, importCatalog } = setup();

    await expect(importCatalog.save(product(['g', 'und']))).rejects.toThrow(MixedUnitBasesError);
    expect(saved).toEqual([]);
  });
});
