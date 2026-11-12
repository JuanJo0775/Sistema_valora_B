import { isValidGtin } from '../../../domain/gtin';
import type { SeedRow } from './seed-source';

export const PRODUCTS_FILE = 'productos.csv';
export const STORES_FILE = 'tiendas.csv';

const UNITS = ['g', 'kg', 'ml', 'l', 'und'];
const STORE_TYPES = ['barrio', 'minimercado', 'supermercado', 'descuento'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const text = (row: SeedRow, column: string): string => (row.values[column] ?? '').trim();

// Grill de la #51, pregunta 3: solo se cargan las filas que el equipo ya revisó.
export const isVerifiedStore = (row: SeedRow): boolean => text(row, 'revisar') === 'no';
export const isVerifiedProduct = (row: SeedRow): boolean =>
  text(row, 'verificar') === 'no' && text(row, 'responsable') !== '';

const at = (file: string, row: SeedRow, message: string): string =>
  `${file}, fila ${String(row.line)}: ${message}`;

const isValidDate = (value: string): boolean =>
  DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

// Trazabilidad (grill de la #51, pregunta 5): una fila verificada sin fuente o sin fecha se rechaza.
function traceErrors(file: string, row: SeedRow, dateColumn: string): string[] {
  const errors: string[] = [];
  if (text(row, 'fuente') === '') errors.push(at(file, row, 'falta la fuente'));
  if (!isValidDate(text(row, dateColumn))) {
    errors.push(at(file, row, 'la fecha debe tener el formato AAAA-MM-DD'));
  }
  return errors;
}

export function storeErrors(rows: SeedRow[]): string[] {
  return rows.flatMap((row) => {
    const errors: string[] = [];
    if (text(row, 'nombre') === '') errors.push(at(STORES_FILE, row, 'falta el nombre'));
    const type = text(row, 'tipo');
    if (!STORE_TYPES.includes(type)) {
      errors.push(
        at(
          STORES_FILE,
          row,
          `el tipo «${type}» no es válido (barrio, minimercado, supermercado o descuento)`,
        ),
      );
    }
    const lat = Number(text(row, 'lat'));
    const lng = Number(text(row, 'lng'));
    const validCoordinates =
      text(row, 'lat') !== '' &&
      text(row, 'lng') !== '' &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180;
    if (!validCoordinates) errors.push(at(STORES_FILE, row, 'las coordenadas no son válidas'));
    return [...errors, ...traceErrors(STORES_FILE, row, 'fecha_consulta')];
  });
}

export function productErrors(rows: SeedRow[], categoryCodes: string[]): string[] {
  const barcodeLines = new Map<string, number>();
  const categoryByProduct = new Map<string, { code: string; line: number }>();

  return rows.flatMap((row) => {
    const errors: string[] = [];
    const name = text(row, 'producto');
    if (name === '') errors.push(at(PRODUCTS_FILE, row, 'falta el producto'));

    const category = text(row, 'categoria');
    if (!categoryCodes.includes(category)) {
      errors.push(at(PRODUCTS_FILE, row, `la categoría «${category}» no existe`));
    }
    const productKey = `${name.toLowerCase()}|${text(row, 'marca').toLowerCase()}`;
    const first = categoryByProduct.get(productKey);
    if (first && first.code !== category) {
      errors.push(
        at(
          PRODUCTS_FILE,
          row,
          `«${name}» ya tiene la categoría ${first.code} en la fila ${String(first.line)}`,
        ),
      );
    }
    if (!first) categoryByProduct.set(productKey, { code: category, line: row.line });

    const quantity = Number(text(row, 'cantidad'));
    if (!(quantity > 0)) {
      errors.push(at(PRODUCTS_FILE, row, 'la cantidad debe ser un número mayor que 0'));
    }
    const unit = text(row, 'unidad');
    if (!UNITS.includes(unit)) {
      errors.push(at(PRODUCTS_FILE, row, `la unidad «${unit}» no es válida (g, kg, ml, l o und)`));
    }
    const packCount = Number(text(row, 'unidades_empaque'));
    if (!Number.isInteger(packCount) || packCount < 1) {
      errors.push(at(PRODUCTS_FILE, row, 'unidades_empaque debe ser un entero mayor o igual a 1'));
    }

    const barcode = text(row, 'codigo_barras');
    if (barcode !== '') {
      const firstLine = barcodeLines.get(barcode);
      if (!isValidGtin(barcode)) {
        errors.push(at(PRODUCTS_FILE, row, `el código de barras «${barcode}» no es válido`));
      } else if (firstLine !== undefined) {
        errors.push(
          at(
            PRODUCTS_FILE,
            row,
            `el código de barras «${barcode}» ya está en la fila ${String(firstLine)}`,
          ),
        );
      } else {
        barcodeLines.set(barcode, row.line);
      }
    }
    return [...errors, ...traceErrors(PRODUCTS_FILE, row, 'fecha')];
  });
}
