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

// Grill de la #26, pregunta 1 (ADR-020): sin imagen, el frontend muestra la ilustración genérica.
export interface ProductImage {
  url: string;
  source: 'open_food_facts' | 'equipo';
  attribution: string;
}

export interface ProductView {
  id: string;
  name: string;
  brand?: string;
  category: CategoryView;
  image?: ProductImage;
  presentations: PresentationView[];
}

// B#120: lo que la canasta básica muestra de cada producto, sin sus presentaciones.
// Con su imagen si la tiene, para las tarjetas del Inicio (ADR-020).
export type ProductSummaryView = Omit<ProductView, 'presentations'>;

// Lo que la comparación necesita:las presentaciones y si la categoría es fresca (TTL, ADR-005).
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

// H3: cómo se nombra una presentación en las pantallas, sin identificadores.
export interface PresentationName {
  // El nombre con marca, como lo arma el catálogo: «Arroz blanco Diana».
  productName: string;
  // La cantidad y la unidad: «1 kg», «6 × 400 ml».
  presentationLabel: string;
}

export interface ProductRepository {
  findById(id: string): Promise<ProductView | null>;
  search(query: ProductSearch): Promise<ProductView[]>;
  findByBarcode(barcode: string): Promise<ProductView[]>;
  presentationExists(presentationId: string): Promise<boolean>;
  // D7 (#205): código de barras → presentación, solo de los códigos que existen.
  presentationIdsByBarcodes(barcodes: string[]): Promise<Map<string, string>>;
  findForComparison(productId: string): Promise<ProductForComparisonView | null>;
  isFreshPresentation(presentationId: string): Promise<boolean | null>;
  labelsOf(presentationIds: string[]): Promise<Map<string, string>>;
  pricingOf(presentationIds: string[]): Promise<Map<string, PresentationForPricing>>;
  namesOf(presentationIds: string[]): Promise<Map<string, PresentationName>>;
  // B#120: nombre, marca, categoría e imagen de varios productos, en una sola consulta.
  summariesOf(productIds: string[]): Promise<Map<string, ProductSummaryView>>;
  // #111: la lista cerrada de categorías, por nombre.
  listCategories(): Promise<CategoryView[]>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
