import { DISPLAY_NAME_LENGTH, isValidDisplayName, normalizeDisplayName } from './display-name';

describe('nombre visible de una cuenta', () => {
  it.each([
    ['Sara'],
    ['María José'],
    ['Ñoño Peña'],
    ["D'Angelo"],
    ['Ana-María'],
    ['Lu'],
    ['A'.repeat(40)],
  ])('«%s» es un nombre válido', (name) => {
    expect(isValidDisplayName(name)).toBe(true);
  });

  it.each([
    ['una sola letra', 'S'],
    ['más de 40 letras', 'A'.repeat(41)],
    ['un correo', 'sara@correo.com'],
    ['un número de teléfono', '3001234567'],
    ['un nombre con números', 'Sara 2'],
    ['un carácter de control', 'Sara\u0007'],
    ['un salto de línea', 'Sara\nPérez'],
    ['solo espacios', '   '],
    ['empieza con guion', '-Sara'],
    ['un emoji', 'Sara 😀'],
  ])('%s no es un nombre válido', (_case, name) => {
    expect(isValidDisplayName(name)).toBe(false);
  });

  it('se guarda sin espacios a los lados ni espacios repetidos', () => {
    expect(normalizeDisplayName('   María    José  ')).toBe('María José');
  });

  it('el largo se cuenta después de quitar los espacios sobrantes', () => {
    expect(isValidDisplayName(normalizeDisplayName(`  ${'A'.repeat(40)}  `))).toBe(true);
    expect(DISPLAY_NAME_LENGTH).toEqual({ min: 2, max: 40 });
  });
});
