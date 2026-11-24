import type { Unit } from './unit-price';

const number = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

// Cómo se lee una presentación («1 kg», «6 × 400 ml»). Es la misma regla de formatPresentation del
// frontend, para que el portal y la ficha pública digan lo mismo.
export function presentationLabelOf({
  quantity,
  unit,
  packCount,
}: {
  quantity: number;
  unit: Unit;
  packCount: number;
}): string {
  const size = `${number.format(quantity)} ${unit}`;
  return packCount > 1 ? `${String(packCount)} × ${size}` : size;
}
