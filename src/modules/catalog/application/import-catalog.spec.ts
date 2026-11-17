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

function setup(existingImageUrl: string | null = null) {
  const saved: ProductImport[] = [];
  const repository: ProductImportRepository = {
    save: (imported) => {
      saved.push(imported);
      return Promise.resolve();
    },
    listProductIds: () => Promise.resolve([]),
    listCategoryCodes: () => Promise.resolve([]),
    imageUrlOf: () => Promise.resolve(existingImageUrl),
    listImages: () => Promise.resolve([]),
    setImage: () => Promise.resolve(),
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

describe('la imagen de la semilla (ADR-022)', () => {
  const OFF = 'https://images.openfoodfacts.org/arroz.jpg';
  const SUPABASE = 'https://abc.supabase.co/storage/v1/object/public/productos/products/p-1.webp';
  const withImage = (): ProductImport => ({
    ...product(['g']),
    image: { url: OFF, source: 'open_food_facts', attribution: 'Open Food Facts, CC BY-SA' },
  });

  it('no reemplaza una imagen que ya apunta a Supabase', async () => {
    const { saved, importCatalog } = setup(SUPABASE);

    await importCatalog.save(withImage());

    expect(saved).toHaveLength(1);
    expect(saved[0]?.image).toBeUndefined();
  });

  it.each([null, OFF])('guarda la imagen del CSV si la actual es %s', async (existing) => {
    const { saved, importCatalog } = setup(existing);

    await importCatalog.save(withImage());

    expect(saved[0]?.image?.url).toBe(OFF);
  });
});
