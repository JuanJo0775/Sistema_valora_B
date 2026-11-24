import { presentationLabelOf } from './presentation-label';

// Igual que formatPresentation del frontend: la cantidad con formato es-CO y, si es un paquete,
// «N × tamaño».
describe('la etiqueta legible de una presentación', () => {
  it.each([
    [{ quantity: 1, unit: 'kg', packCount: 1 }, '1 kg'],
    [{ quantity: 500, unit: 'g', packCount: 1 }, '500 g'],
    [{ quantity: 1.5, unit: 'l', packCount: 1 }, '1,5 l'],
    [{ quantity: 400, unit: 'ml', packCount: 6 }, '6 × 400 ml'],
    [{ quantity: 12, unit: 'und', packCount: 1 }, '12 und'],
  ] as const)('%j se lee «%s»', (presentation, label) => {
    expect(presentationLabelOf(presentation)).toBe(label);
  });
});
