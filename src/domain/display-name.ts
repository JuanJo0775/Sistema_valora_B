// #133 (RF-001): el nombre con el que la app saluda a la persona («Hola, Sara»). Solo letras (con
// tildes y ñ), espacios, apóstrofo y guion: así no cabe un correo, un teléfono ni un carácter de
// control. Nunca sale en una respuesta pública (EC-08).
export const DISPLAY_NAME_LENGTH = { min: 2, max: 40 };

// Empieza y termina con una letra; en medio, letras y un espacio, apóstrofo o guion a la vez.
const PATTERN = /^\p{L}+(?:[ '-]\p{L}+)*$/u;

// Sin espacios a los lados y con un solo espacio entre palabras.
export function normalizeDisplayName(name: string): string {
  return name.trim().replace(/ {2,}/g, ' ');
}

export function isValidDisplayName(name: string): boolean {
  // El patrón solo deja letras, así que basta el largo del texto.
  const { length } = name;
  return (
    length >= DISPLAY_NAME_LENGTH.min && length <= DISPLAY_NAME_LENGTH.max && PATTERN.test(name)
  );
}
