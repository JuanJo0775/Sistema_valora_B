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

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface ProductRepository {
  findById(id: string): Promise<ProductView | null>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
