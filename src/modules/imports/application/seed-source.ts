// Una fila de un CSV de la semilla, con su número de línea en el archivo (el encabezado es la línea 1).
export interface SeedRow {
  line: number;
  values: Record<string, string>;
}

// Puerto: de dónde salen las filas de la semilla (grill de la #51, pregunta 1: los CSV de seed/).
export interface SeedSource {
  readProducts(): Promise<SeedRow[]>;
  readStores(): Promise<SeedRow[]>;
}

export const SEED_SOURCE = Symbol('SEED_SOURCE');
