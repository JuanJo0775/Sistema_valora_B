import type { ProductView } from '../application/product-repository';

// DTO de salida explícito (regla api-rest): la forma del esquema Product de docs/openapi.yaml.
export interface ProductResponse {
  id: string;
  name: string;
  brand?: string;
  category: { code: string; name: string };
  image?: { url: string; source: string; attribution: string };
  presentations: {
    id: string;
    barcode?: string;
    quantity: number;
    unit: string;
    packCount: number;
  }[];
}

export function toProductResponse(product: ProductView): ProductResponse {
  return {
    id: product.id,
    name: product.name,
    ...(product.brand === undefined ? {} : { brand: product.brand }),
    category: { code: product.category.code, name: product.category.name },
    ...(product.image === undefined
      ? {}
      : {
          image: {
            url: product.image.url,
            source: product.image.source,
            attribution: product.image.attribution,
          },
        }),
    presentations: product.presentations.map((presentation) => ({
      id: presentation.id,
      ...(presentation.barcode === undefined ? {} : { barcode: presentation.barcode }),
      quantity: presentation.quantity,
      unit: presentation.unit,
      packCount: presentation.packCount,
    })),
  };
}
