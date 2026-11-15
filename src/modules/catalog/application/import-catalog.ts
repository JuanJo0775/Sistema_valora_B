import { assertSameBase, type Unit } from '../../../domain/unit-price';
import type { ProductImage } from './product-repository';
import type { WholesaleReference, WholesaleReferenceRepository } from './wholesale-references';

// Producto completo tal como lo carga la semilla (issue #51), con ids fijos ya calculados.
export interface ProductImport {
  id: string;
  name: string;
  brand?: string;
  categoryCode: string;
  // Grill de la #26: otros nombres para la búsqueda y la imagen con su fuente (ADR-020).
  aliases?: string[];
  image?: ProductImage;
  presentations: {
    id: string;
    barcode?: string;
    quantity: number;
    unit: Unit;
    packCount: number;
  }[];
}

export interface ProductImportRepository {
  // Inserta o actualiza por id: repetir la semilla no duplica (grill de la #51, pregunta 2).
  save(product: ProductImport): Promise<void>;
  listProductIds(): Promise<string[]>;
  listCategoryCodes(): Promise<string[]>;
}

export const PRODUCT_IMPORT_REPOSITORY = Symbol('PRODUCT_IMPORT_REPOSITORY');

// Puerta de entrada pública para que el módulo imports guarde productos sin tocar las tablas de catalog.
export class ImportCatalog {
  constructor(
    private readonly products: ProductImportRepository,
    private readonly references: Pick<WholesaleReferenceRepository, 'save'>,
  ) {}

  // Issue #59: la comparación (#15, #21) nunca recibe un producto con bases mezcladas.
  async save(product: ProductImport): Promise<void> {
    assertSameBase(product.presentations.map((presentation) => presentation.unit));
    await this.products.save(product);
  }

  // Grill de la #34 (RF-014): la referencia SIPSA de un producto, cargada a mano.
  saveReference(reference: WholesaleReference): Promise<void> {
    return this.references.save(reference);
  }

  listProductIds(): Promise<string[]> {
    return this.products.listProductIds();
  }

  // Para validar la categoría de cada fila antes de guardar (lista cerrada, grill de la #49).
  listCategoryCodes(): Promise<string[]> {
    return this.products.listCategoryCodes();
  }
}
