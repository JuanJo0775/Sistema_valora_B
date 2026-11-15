import type { Unit } from '../../../domain/unit-price';

export interface CategoryView {
  code: string;
  name: string;
}

// Presentación tal como se escribe en el empaque (grill de la #49, pregunta 1).
export interface PresentationView {
  id: string;
  barcode?: string;
  quantity: number;
  unit: Unit;
  packCount: number;
}

export interface ProductView {
  id: string;
  name: string;
  brand?: string;
  category: CategoryView;
  presentations: PresentationView[];
}

// Lo que la comparación necesita: las presentaciones y si la categoría es fresca (TTL, ADR-005).
export interface ProductForComparisonView {
  id: string;
  isFresh: boolean;
  presentations: Omit<PresentationView, 'barcode'>[];
}

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface ProductSearch {
  text: string;
  limit: number;
}

// Grill de la #28: lo que la ruta de precios por tienda necesita de cada presentación.
export interface PresentationForPricing {
  productId: string;
  label: string;
  quantity: number;
  unit: Unit;
  packCount: number;
  isFresh: boolean;
}

export interface ProductRepository {
  findById(id: string): Promise<ProductView | null>;
  search(query: ProductSearch): Promise<ProductView[]>;
  findByBarcode(barcode: string): Promise<ProductView[]>;
  presentationExists(presentationId: string): Promise<boolean>;
  findForComparison(productId: string): Promise<ProductForComparisonView | null>;
  isFreshPresentation(presentationId: string): Promise<boolean | null>;
  labelsOf(presentationIds: string[]): Promise<Map<string, string>>;
  pricingOf(presentationIds: string[]): Promise<Map<string, PresentationForPricing>>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
