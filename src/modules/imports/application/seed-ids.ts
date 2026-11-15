import type { SeedRow } from './seed-source';
import { text } from './seed-rows';
import { stableId } from './stable-id';

// Ids fijos (grill de la #51, pregunta 2): tienda por osm_id; producto por nombre y marca;
// presentación por producto, cantidad, unidad y unidades del empaque, tal como se escriben en el CSV.
export const storeId = (row: SeedRow): string => stableId('establishment', text(row, 'osm_id'));

export const productId = (row: SeedRow): string =>
  stableId('product', text(row, 'producto').toLowerCase(), text(row, 'marca').toLowerCase());

export const presentationId = (row: SeedRow): string =>
  stableId(
    'presentation',
    productId(row),
    text(row, 'cantidad'),
    text(row, 'unidad'),
    text(row, 'unidades_empaque'),
  );
