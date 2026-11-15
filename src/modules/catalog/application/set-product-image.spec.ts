import { InvalidImageError } from './product-image';
import type { ProductImage } from './product-repository';
import { SetProductImage } from './set-product-image';

const productId = 'producto-1';

function setup(existing: string[] = [productId]) {
  const saved: { name: string; content: string }[] = [];
  const images: { productId: string; image: ProductImage }[] = [];
  const setImage = new SetProductImage({
    products: { exists: (id) => Promise.resolve(existing.includes(id)) },
    processor: {
      toWebp: (photo) => {
        if (photo.toString() === 'no es imagen') return Promise.reject(new InvalidImageError());
        return Promise.resolve(Buffer.from(`webp de ${photo.toString()}`));
      },
    },
    storage: {
      save: (name, content) => {
        saved.push({ name, content: content.toString() });
        return Promise.resolve(`https://media.valora.test/${name}`);
      },
    },
    images: {
      setImage: (id, image) => {
        images.push({ productId: id, image });
        return Promise.resolve();
      },
    },
  });
  return { saved, images, setImage };
}

describe('el moderador sube la foto de un producto (ADR-020, #88)', () => {
  it('se procesa, se guarda con un nombre por su contenido y queda como foto del equipo', async () => {
    const { saved, images, setImage } = setup();

    const image = await setImage.execute(productId, Buffer.from('foto'));

    expect(saved).toEqual([
      {
        name: expect.stringMatching(/^products\/producto-1-[0-9a-f]{12}\.webp$/) as unknown,
        content: 'webp de foto',
      },
    ]);
    const expected = {
      url: `https://media.valora.test/${saved[0]?.name ?? ''}`,
      source: 'equipo',
      attribution: 'Equipo Valora',
    };
    expect(image).toEqual(expected);
    expect(images).toEqual([{ productId, image: expected }]);
  });

  it('un producto que no existe no se toca', async () => {
    const { saved, images, setImage } = setup([]);

    await expect(setImage.execute(productId, Buffer.from('foto'))).resolves.toBeNull();
    expect(saved).toEqual([]);
    expect(images).toEqual([]);
  });

  it('un archivo que no es imagen no guarda nada', async () => {
    const { saved, images, setImage } = setup();

    await expect(setImage.execute(productId, Buffer.from('no es imagen'))).rejects.toThrow(
      InvalidImageError,
    );
    expect(saved).toEqual([]);
    expect(images).toEqual([]);
  });
});
